import { Telegraf, Context, Markup } from 'telegraf';
import { botConfig } from '../config';
import { formatDate } from '../utils/dateHelper';
import { logger } from '../utils/logger';
import {
  findUserByTelegramId,
  createUser,
  updateUser
} from '../database/fileStorage';
import { addTransactionRecord, getAllTransactions, calculateBalance } from '../services/googleSheets';
import { parseTransactionWithValidation, getTransactionExamples, validateAndParseAmount } from '../utils/messageParser';
import { forceCheckForNewTransactions } from '../services/notificationService';
import { TransactionRecord, User, UserState, TransactionType } from '../types';

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
      Markup.button.url('📊 Таблица', `https://docs.google.com/spreadsheets/d/${botConfig.spreadsheetId}/edit`),
      Markup.button.callback('ℹ️ Помощь', 'help')
    ]
  ]);
}

// Функция для создания меню выбора типа операции
function getTransactionTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`💰 ${botConfig.participants.dmitry} → ${botConfig.participants.alexander} (+)`, 'add_give')
    ],
    [
      Markup.button.callback(`💸 ${botConfig.participants.alexander} → ${botConfig.participants.dmitry} (-)`, 'add_take')
    ],
    [
      Markup.button.callback('🏠 Главное меню', 'main_menu')
    ]
  ]);
}

// Функции для управления состоянием пользователя
async function setUserState(telegramId: number, state: UserState, transactionType?: TransactionType, amount?: number) {
  const updates: Partial<User> = { state };
  if (transactionType !== undefined) {
    updates.tempTransactionType = transactionType;
  }
  if (amount !== undefined) {
    updates.tempAmount = amount;
  }
  await updateUser(telegramId, updates);
}

async function clearUserState(telegramId: number) {
  await updateUser(telegramId, {
    state: 'idle'
  });
}

function getUserState(user: User): UserState {
  return user.state || 'idle';
}

// Middleware для проверки вайтлиста пользователей
bot.use(async (ctx, next) => {
  if (!ctx.from) return;

  const telegramId = ctx.from.id;

  // Проверяем вайтлист
  if (botConfig.allowedUsers.length > 0 && !botConfig.allowedUsers.includes(telegramId)) {
    logger.warn(`🚫 Access denied for user ${telegramId} (@${ctx.from.username}) - not in whitelist`);
    await ctx.reply('❌ Доступ запрещен. Вы не авторизованы для использования этого бота.');
    return;
  }

  // Если пользователь в вайтлисте, продолжаем
  return next();
});

// Middleware для проверки пользователя
bot.use(async (ctx, next) => {
  if (!ctx.from) return;

  const telegramId = ctx.from.id;

  // Проверяем существующего пользователя
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

    logger.info(`✅ New user registered: ${user.firstName} (@${user.username})`);
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
      const message = `⚖️ Баланс равен нулю. Никто никому не должен!

🏠 Главное меню:`;
      await ctx.reply(message, getMainMenuKeyboard());
      return;
    }

    const formattedAmount = balance.amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const balanceMessage = `
⚖️ Текущий баланс взаиморасчетов:

${balance.debtor === botConfig.participants.dmitry ? '💸' : '💰'} ${balance.description}: ${botConfig.currency.symbol}${formattedAmount}

🏠 Главное меню:`;

    await ctx.reply(balanceMessage, getMainMenuKeyboard());
  } catch (error) {
    logger.error('Error getting balance:', error as Error);
    await ctx.reply('❌ Ошибка при получении баланса');
  }
}

async function handleHistoryCommand(ctx: Context) {
  try {
    const allTransactions = await getAllTransactions();

    if (allTransactions.length === 0) {
      const message = `📝 Записей пока нет

🏠 Главное меню:`;
      await ctx.reply(message, getMainMenuKeyboard());
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

    historyMessage += `\n\n🏠 Главное меню:`;

    await ctx.reply(historyMessage, {
      parse_mode: 'HTML',
      ...getMainMenuKeyboard()
    });
  } catch (error) {
    logger.error('Error getting history:', error as Error);
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

🎯 **Основные функции:**
• 💰 **Баланс** - просмотр текущего состояния взаиморасчетов
• 📝 **История** - последние 10 транзакций с итоговым балансом
• ➕ **Добавить** - пошаговое добавление новых операций
• 🔔 **Уведомления** - настройка получения уведомлений

🚀 **Как добавить транзакцию:**

**Способ 1: Через кнопки (рекомендуется)**
1️⃣ Нажмите "➕ Добавить"
2️⃣ Выберите направление денег
3️⃣ Введите сумму (например: 150 или 150.50)
4️⃣ Введите описание (например: обед в кафе)

**Способ 2: Быстрый ввод**
Отправьте сообщение: \`сумма описание\`
${getTransactionExamples()}

💡 **Логика знаков:**
• **+** (плюс) = ${botConfig.participants.dmitry} → ${botConfig.participants.alexander}
• **-** (минус) = ${botConfig.participants.alexander} → ${botConfig.participants.dmitry}

🔧 **Дополнительные команды:**
• \`/menu\` - вызвать главное меню
• \`/start\` - перезапустить бота

📊 **Автоматические функции:**
• ✅ Синхронизация с Google Sheets
• ✅ Уведомления о новых транзакциях всем участникам
• ✅ Автоматический расчет баланса с математическими формулами
• ✅ Форматирование сумм с разделителями тысяч

🏠 Главное меню:`;

  await ctx.reply(helpMessage, getMainMenuKeyboard());
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

Выберите тип операции:`;

  await ctx.reply(message, getTransactionTypeKeyboard());
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

// Обработчики для пошагового добавления транзакций
bot.action('add_give', async (ctx) => {
  await ctx.answerCbQuery();
  await setUserState(ctx.user!.telegramId, 'waiting_for_amount', 'give');

  const message = `
💰 ${botConfig.participants.dmitry} → ${botConfig.participants.alexander} (+)

Введите сумму в долларах:
Например: 150 или 150.50`;

  await ctx.reply(message, Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', 'cancel_add')]
  ]));
});

bot.action('add_take', async (ctx) => {
  await ctx.answerCbQuery();
  await setUserState(ctx.user!.telegramId, 'waiting_for_amount', 'take');

  const message = `
💸 ${botConfig.participants.alexander} → ${botConfig.participants.dmitry} (-)

Введите сумму в долларах:
Например: 150 или 150.50`;

  await ctx.reply(message, Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', 'cancel_add')]
  ]));
});

bot.action('cancel_add', async (ctx) => {
  await ctx.answerCbQuery();
  await clearUserState(ctx.user!.telegramId);
  await ctx.reply('❌ Добавление транзакции отменено', getMainMenuKeyboard());
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
    // Запускаем пошаговое добавление
    const responseMessage = `
➕ Добавить новую транзакцию

Выберите тип операции:`;

    await ctx.reply(responseMessage, getTransactionTypeKeyboard());
    return;
  }

  // Если есть параметры, обрабатываем в старом формате
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

// Обработка текстовых сообщений с учетом состояния пользователя
bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  const user = ctx.user!;
  const userState = getUserState(user);

  // Обрабатываем неизвестные команды
  if (message.startsWith('/')) {
    // Если пользователь в процессе добавления транзакции, сбрасываем состояние
    if (userState !== 'idle') {
      await clearUserState(user.telegramId);
    }

    await ctx.reply(
      '❓ Неизвестная команда. Используйте главное меню:',
      getMainMenuKeyboard()
    );
    return;
  }

  // Обрабатываем сообщения в зависимости от состояния пользователя
  switch (userState) {
    case 'waiting_for_amount':
      await handleAmountInput(ctx, message);
      break;
    case 'waiting_for_description':
      await handleDescriptionInput(ctx, message);
      break;
    case 'idle':
    default:
      // Обычные сообщения обрабатываем как транзакции (старый формат)
      await handleTransactionInput(ctx, message);
      break;
  }
});

// Обработчик ввода суммы в пошаговом режиме
async function handleAmountInput(ctx: Context & { user?: User }, message: string) {
  const user = ctx.user!;
  const amountStr = message.trim();

  // Валидируем сумму (используем функцию из messageParser)
  const { isValid, amount, error } = validateAndParseAmount(amountStr);

  if (!isValid) {
    await ctx.reply(`
❌ ${error}

Попробуйте еще раз. Введите сумму в долларах:
Например: 150 или 150.50`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_add')]]));
    return;
  }

  // Сохраняем сумму и переходим к следующему шагу
  await setUserState(user.telegramId, 'waiting_for_description', user.tempTransactionType, amount);

  const typeEmoji = user.tempTransactionType === 'give' ? '💰' : '💸';
  const typeText = user.tempTransactionType === 'give'
    ? `${botConfig.participants.dmitry} → ${botConfig.participants.alexander}`
    : `${botConfig.participants.alexander} → ${botConfig.participants.dmitry}`;
  const formattedAmount = amount!.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const responseMessage = `
${typeEmoji} ${typeText}: $${formattedAmount}

Теперь введите описание транзакции:
Например: обед в кафе, проезд, покупки`;

  await ctx.reply(responseMessage, Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', 'cancel_add')]
  ]));
}

// Обработчик ввода описания в пошаговом режиме
async function handleDescriptionInput(ctx: Context & { user?: User }, message: string) {
  const user = ctx.user!;
  const description = message.trim();

  if (!description) {
    await ctx.reply(`
❌ Описание не может быть пустым

Попробуйте еще раз. Введите описание транзакции:
Например: обед в кафе, проезд, покупки`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_add')]]));
    return;
  }

  // Создаем транзакцию
  try {
    const userName = user.firstName || user.username || `User${user.telegramId}`;

    const transactionRecord: TransactionRecord = {
      date: formatDate(new Date()),
      user: userName,
      amount: user.tempAmount!,
      description,
      type: user.tempTransactionType!
    };

    logger.info(`➕ Adding transaction: ${user.tempTransactionType === 'give' ? '+' : '-'}$${user.tempAmount} - ${description} by ${userName}`);
    await addTransactionRecord(transactionRecord);

    // Очищаем состояние пользователя
    await clearUserState(user.telegramId);

    // Отправляем подтверждение
    const typeEmoji = user.tempTransactionType === 'give' ? '💰' : '💸';
    const sign = user.tempTransactionType === 'give' ? '+' : '-';
    const typeText = user.tempTransactionType === 'give'
      ? `${botConfig.participants.dmitry} → ${botConfig.participants.alexander}`
      : `${botConfig.participants.alexander} → ${botConfig.participants.dmitry}`;
    const formattedAmount = user.tempAmount!.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    await ctx.reply(`
✅ Транзакция успешно добавлена!

${typeEmoji} ${typeText} ${sign}$${formattedAmount}
📝 ${description}`,
      getMainMenuKeyboard());

    // Небольшая задержка для синхронизации с Google Sheets
    setTimeout(async () => {
      await forceCheckForNewTransactions();
    }, 2000);

  } catch (error) {
    logger.error('Error adding transaction:', error as Error);
    await clearUserState(user.telegramId);
    await ctx.reply('❌ Ошибка при добавлении транзакции', getMainMenuKeyboard());
  }
}

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

    logger.info(`➕ Adding transaction: ${parsed.type === 'give' ? '+' : '-'}$${parsed.amount} - ${parsed.description} by ${userName}`);
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
    logger.error('Error adding transaction:', error as Error);
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