import { Telegraf, Context, Markup } from 'telegraf';
import { botConfig } from '../config';
import { formatDate } from '../utils/dateHelper';
import { 
  findUserByTelegramId, 
  createUser, 
  updateUser, 
  getAllUsersWithNotifications 
} from '../database/fileStorage';
import { addTransactionRecord, getRecentTransactions, getAllTransactions, formatTransactionForMessage, calculateBalance } from '../services/googleSheets';
import { parseTransactionWithValidation, formatTransactionInput, getTransactionExamples } from '../utils/messageParser';
import { forceCheckForNewTransactions } from '../services/notificationService';
import { TransactionRecord, User } from '../types';

const bot = new Telegraf(botConfig.token);

// Функция для создания главного меню
function getMainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Баланс', 'balance'),
      Markup.button.callback('📝 История', 'history')
    ],
    [
      Markup.button.callback('➕ Добавить', 'add'),
      Markup.button.callback('🔔 Уведомления', 'notifications')
    ],
    [
      Markup.button.callback('ℹ️ Помощь', 'help')
    ]
  ]);
}

// Middleware для проверки пользователя
bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  
  const telegramId = ctx.from.id;
  let user = await findUserByTelegramId(telegramId);
  
  if (!user) {
    // Создаем нового пользователя
    user = await createUser({
      telegramId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      isAdmin: telegramId === botConfig.adminUserId,
      notificationsEnabled: true
    });
    
    console.log(`✅ New user registered: ${user.firstName} (@${user.username})`);
  }
  
  ctx.user = user;
  return next();
});

// Команда /start
bot.command('start', async (ctx) => {
  const user = ctx.user!;
  const welcomeMessage = `
🎉 Добро пожаловать в RBI Bot!

Я помогу вам вести учет взаиморасчетов между ${botConfig.participants.dmitry} и ${botConfig.participants.alexander}.

👤 Пользователь: ${user.firstName}${user.username ? ` (@${user.username})` : ''}
${user.isAdmin ? '👑 Администратор' : ''}

Выберите действие:`;
  
  await ctx.reply(welcomeMessage, getMainMenuKeyboard());
});

// Вспомогательные функции для команд
async function handleBalanceCommand(ctx: Context) {
  try {
    const balance = await calculateBalance();
    
    if (balance.amount === 0) {
      await ctx.reply('⚖️ Баланс равен нулю. Никто никому не должен!', 
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
      return;
    }

    const formattedAmount = balance.amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const balanceMessage = `
⚖️ Текущий баланс взаиморасчетов:

${balance.debtor === botConfig.participants.dmitry ? '💸' : '💰'} ${balance.description}: ${botConfig.currency.symbol}${formattedAmount}
`;

    await ctx.reply(balanceMessage, 
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
  } catch (error) {
    console.error('Error getting balance:', error);
    await ctx.reply('❌ Ошибка при получении баланса');
  }
}

async function handleHistoryCommand(ctx: Context) {
  try {
    const allTransactions = await getAllTransactions();
    
    if (allTransactions.length === 0) {
      await ctx.reply('📝 Записей пока нет',
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
      return;
    }

    const recentTransactions = allTransactions.slice(-10);
    
    const currencySymbol = botConfig.currency.symbol === '$' ? '&#36;' : botConfig.currency.symbol;
    let codeBlock = `Дата            Сумма Описание\n`;
    codeBlock += `---------- ------------- --------\n`;
    
    recentTransactions.forEach((transaction) => {
      const sign = transaction.type === 'give' ? '+' : '-';
      const formattedAmount = transaction.amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      
      const date = transaction.date.padEnd(10);
      const amount = `${sign}${formattedAmount}`.padStart(13);
      const description = transaction.description.length > 20 
        ? transaction.description.substring(0, 17) + '...'
        : transaction.description;
      
      codeBlock += `${date} ${amount} ${description}\n`;
    });

    let historyMessage = `📝 История транзакций (${allTransactions.length} всего):\n\n<pre>${codeBlock}</pre>`;

    if (allTransactions.length > 10) {
      historyMessage += `\n\n... и еще ${allTransactions.length - 10} транзакций`;
    }

    const currentBalance = await calculateBalance();
    if (currentBalance.amount === 0) {
      historyMessage += `\n\n⚖️ Итоговый баланс: ${currencySymbol}0.00`;
    } else {
      const sign = currentBalance.debtor === botConfig.participants.dmitry ? '-' : '+';
      const formattedBalance = currentBalance.amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      historyMessage += `\n\n⚖️ Итоговый баланс: ${sign}${currencySymbol}${formattedBalance}`;
    }

    await ctx.reply(historyMessage, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]])
    });
  } catch (error) {
    console.error('Error getting history:', error);
    await ctx.reply('❌ Ошибка при получении истории');
  }
}

async function handleNotificationsCommand(ctx: Context & { user?: User }) {
  const user = ctx.user!;
  const status = user.notificationsEnabled ? 'включены' : 'выключены';
  
  const message = `
🔔 Уведомления сейчас ${status}

Что вы хотите сделать?`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(user.notificationsEnabled ? '🔕 Выключить' : '🔔 Включить', 
        user.notificationsEnabled ? 'notifications_off' : 'notifications_on')
    ],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);

  await ctx.reply(message, keyboard);
}

async function handleHelpCommand(ctx: Context) {
  const helpMessage = `
📖 Справка по RBI Bot:

🎯 Основные функции:
• Добавление транзакций с +/- знаками
• Автоматический расчет баланса взаиморасчетов
• Уведомления о новых операциях
• Интеграция с Google Sheets

${getTransactionExamples()}

🔧 Дополнительные возможности:
• Отправьте сообщение в формате "сумма описание" для быстрого добавления
• Используйте + если даете деньги, - если берете деньги
• Бот автоматически уведомляет о новых транзакциях
`;
  
  await ctx.reply(helpMessage, 
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
}

// Обработчики callback queries (кнопки)
bot.action('balance', async (ctx) => {
  await ctx.answerCbQuery();
  await handleBalanceCommand(ctx);
});

bot.action('history', async (ctx) => {
  await ctx.answerCbQuery();
  await handleHistoryCommand(ctx);
});

bot.action('add', async (ctx) => {
  await ctx.answerCbQuery();
  const message = `
➕ Добавить новую транзакцию

${getTransactionExamples()}

Отправьте сообщение в формате: <сумма> <описание>
Например: 150 обед в кафе`;
  
  await ctx.reply(message, Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]));
});

bot.action('notifications', async (ctx) => {
  await ctx.answerCbQuery();
  await handleNotificationsCommand(ctx);
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await handleHelpCommand(ctx);
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('🏠 Главное меню:', getMainMenuKeyboard());
});

// Обработчики для включения/выключения уведомлений
bot.action('notifications_on', async (ctx) => {
  await ctx.answerCbQuery();
  await updateUser(ctx.user!.telegramId, { notificationsEnabled: true });
  await ctx.reply('🔔 Уведомления включены', 
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
});

bot.action('notifications_off', async (ctx) => {
  await ctx.answerCbQuery();
  await updateUser(ctx.user!.telegramId, { notificationsEnabled: false });
  await ctx.reply('🔕 Уведомления выключены',
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
});

// Команда /help
bot.command('help', async (ctx) => {
  await handleHelpCommand(ctx);
});

// Команда /menu - быстрый доступ к главному меню
bot.command('menu', async (ctx) => {
  await ctx.reply('🏠 Главное меню:', getMainMenuKeyboard());
});

// Команда /add
bot.command('add', async (ctx) => {
  const message = ctx.message.text.replace('/add', '').trim();
  
  if (!message) {
    await ctx.reply(`
➕ Добавить новую транзакцию

${getTransactionExamples()}

Отправьте сообщение в формате: <сумма> <описание>
Например: 150 обед в кафе`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
    ]));
    return;
  }

  await handleTransactionInput(ctx, message);
});

// Команда /balance
bot.command('balance', async (ctx) => {
  await handleBalanceCommand(ctx);
});

// Команда /history
bot.command('history', async (ctx) => {
  await handleHistoryCommand(ctx);
});

// Команда /notifications
bot.command('notifications', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const action = args[1]?.toLowerCase();
  
  if (!action || (action !== 'on' && action !== 'off')) {
    await handleNotificationsCommand(ctx);
    return;
  }

  const enabled = action === 'on';
  await updateUser(ctx.user!.telegramId, { notificationsEnabled: enabled });
  
  const status = enabled ? 'включены' : 'выключены';
  const emoji = enabled ? '🔔' : '🔕';
  await ctx.reply(`${emoji} Уведомления ${status}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
});

// Обработка неизвестных команд
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  
  // Обрабатываем неизвестные команды
  if (message.startsWith('/')) {
    await ctx.reply(
      '❓ Неизвестная команда. Используйте главное меню:',
      getMainMenuKeyboard()
    );
    return;
  }
  
  // Обычные сообщения обрабатываем как транзакции
  await handleTransactionInput(ctx, message);
});

async function handleTransactionInput(ctx: Context & { user?: User }, message: string) {
  const result = parseTransactionWithValidation(message);
  
  if (!result.success) {
    await ctx.reply(`
❌ ${result.error}

${getTransactionExamples()}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
    return;
  }

  const parsed = result.transaction!;

  try {
    const user = ctx.user!;
    const userName = user.firstName || user.username || `User${user.telegramId}`;
    
    const transactionRecord: TransactionRecord = {
      date: formatDate(new Date()),
      user: userName,
      amount: parsed.amount,
      description: parsed.description,
      type: parsed.type
    };

    await addTransactionRecord(transactionRecord);
    
    // Простое подтверждение - детали придут в уведомлении
    await ctx.reply('✅ Транзакция успешно добавлена',
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]])
    );
    
    // Небольшая задержка для синхронизации с Google Sheets
    setTimeout(async () => {
      // Запускаем проверку новых транзакций - это отправит уведомления всем пользователям
      await forceCheckForNewTransactions();
    }, 2000); // 2 секунды задержки
    
  } catch (error) {
    console.error('Error adding transaction:', error);
    await ctx.reply('❌ Ошибка при добавлении транзакции',
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
  }
}



export { bot };

// Расширяем типы для Context
declare module 'telegraf' {
  interface Context {
    user?: User;
  }
} 