import { Telegraf, Context } from 'telegraf';
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

📋 Доступные команды:
/add - Добавить новую транзакцию
/balance - Показать баланс взаиморасчетов
/history - Показать последние записи
/notifications - Настроить уведомления
/help - Помощь

${getTransactionExamples()}
`;
  
  await ctx.reply(welcomeMessage);
});

// Команда /help
bot.command('help', async (ctx) => {
  const helpMessage = `
📖 Справка по командам:

/start - Начать работу с ботом
/add <сумма> <описание> - Добавить транзакцию
/balance - Показать текущий баланс взаиморасчетов
/history - Показать последние 10 записей
/notifications on/off - Включить/выключить уведомления

${getTransactionExamples()}

🔧 Дополнительные возможности:
• Отправьте сообщение в формате "сумма описание" для быстрого добавления
• Используйте + если даете деньги, - если берете деньги
• Бот автоматически уведомляет о новых транзакциях
`;
  
  await ctx.reply(helpMessage);
});

// Команда /add
bot.command('add', async (ctx) => {
  const message = ctx.message.text.replace('/add', '').trim();
  
  if (!message) {
    await ctx.reply(`
❌ Укажите сумму и описание после команды.

Пример: /add 1000 перевод на карту

${getTransactionExamples()}
`);
    return;
  }

  await handleTransactionInput(ctx, message);
});

// Команда /balance
bot.command('balance', async (ctx) => {
  try {
    const balance = await calculateBalance();
    
    if (balance.amount === 0) {
      await ctx.reply('⚖️ Баланс равен нулю. Никто никому не должен!');
      return;
    }

    // Форматируем сумму с запятыми для тысяч
    const formattedAmount = balance.amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const balanceMessage = `
⚖️ Текущий баланс взаиморасчетов:

${balance.debtor === botConfig.participants.dmitry ? '💸' : '💰'} ${balance.description}: ${botConfig.currency.symbol}${formattedAmount}
`;

    await ctx.reply(balanceMessage);
  } catch (error) {
    console.error('Error getting balance:', error);
    await ctx.reply('❌ Ошибка при получении баланса');
  }
});

// Команда /history
bot.command('history', async (ctx) => {
  try {
    const allTransactions = await getAllTransactions();
    
    if (allTransactions.length === 0) {
      await ctx.reply('📝 Записей пока нет');
      return;
    }

    // Показываем последние 10 записей в том же порядке что и в таблице (новые внизу)
    const recentTransactions = allTransactions.slice(-10);
    
    // Экранируем символ доллара для HTML
    const currencySymbol = botConfig.currency.symbol === '$' ? '&#36;' : botConfig.currency.symbol;
    let codeBlock = `Дата            Сумма Описание\n`;
    codeBlock += `---------- ------------- --------\n`;
    
    recentTransactions.forEach((transaction) => {
      // Форматируем сумму со знаком
      const sign = transaction.type === 'give' ? '+' : '-';
      const formattedAmount = transaction.amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      
      // Форматируем строку с фиксированной шириной колонок
      const date = transaction.date.padEnd(10);
      const amount = `${sign}${formattedAmount}`.padStart(13);
      // Ограничиваем описание до 20 символов для избежания переноса
      const description = transaction.description.length > 20 
        ? transaction.description.substring(0, 17) + '...'
        : transaction.description;
      
      codeBlock += `${date} ${amount} ${description}\n`;
    });

    let historyMessage = `📝 История транзакций (${allTransactions.length} всего):\n\n<pre>${codeBlock}</pre>`;

    if (allTransactions.length > 10) {
      historyMessage += `\n\n... и еще ${allTransactions.length - 10} транзакций`;
    }

    // Добавляем итоговый баланс
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

    await ctx.reply(historyMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error getting history:', error);
    await ctx.reply('❌ Ошибка при получении истории');
  }
});

// Команда /notifications
bot.command('notifications', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const action = args[1]?.toLowerCase();
  
  if (!action || (action !== 'on' && action !== 'off')) {
    const user = ctx.user!;
    const status = user.notificationsEnabled ? 'включены' : 'выключены';
    await ctx.reply(`
🔔 Уведомления сейчас ${status}

Использование:
/notifications on - Включить уведомления
/notifications off - Выключить уведомления
`);
    return;
  }

  const enabled = action === 'on';
  await updateUser(ctx.user!.telegramId, { notificationsEnabled: enabled });
  
  const status = enabled ? 'включены' : 'выключены';
  const emoji = enabled ? '🔔' : '🔕';
  await ctx.reply(`${emoji} Уведомления ${status}`);
});

// Обработка текстовых сообщений (добавление записей)
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  
  // Игнорируем команды, которые уже обработаны
  if (message.startsWith('/')) {
    return;
  }
  
  await handleTransactionInput(ctx, message);
});

async function handleTransactionInput(ctx: Context & { user?: User }, message: string) {
  const result = parseTransactionWithValidation(message);
  
  if (!result.success) {
    await ctx.reply(`
❌ ${result.error}

${getTransactionExamples()}
`);
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
    await ctx.reply('✅ Транзакция успешно добавлена');
    
    // Небольшая задержка для синхронизации с Google Sheets
    setTimeout(async () => {
      // Запускаем проверку новых транзакций - это отправит уведомления всем пользователям
      await forceCheckForNewTransactions();
    }, 2000); // 2 секунды задержки
    
  } catch (error) {
    console.error('Error adding transaction:', error);
    await ctx.reply('❌ Ошибка при добавлении транзакции');
  }
}



export { bot };

// Расширяем типы для Context
declare module 'telegraf' {
  interface Context {
    user?: User;
  }
} 