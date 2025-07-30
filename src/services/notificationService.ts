import * as cron from 'node-cron';
import { getRowCountSafe, getAllTransactions, calculateBalance } from './googleSheets';
import { getNotificationData, updateNotificationData, getAllUsersWithNotifications } from '../database/fileStorage';
import { bot } from '../bot';
import { botConfig } from '../config';
import { formatTransactionInput } from '../utils/messageParser';
import { logger } from '../utils/logger';

let isMonitoringStarted = false;
let cronTask: cron.ScheduledTask | null = null;

export function startNotificationService(): void {
  if (isMonitoringStarted) {
    logger.warn('⚠️ Notification service already started');
    return;
  }

  logger.info(`📅 Starting notification service with interval: ${botConfig.notificationInterval}`);
  
  cronTask = cron.schedule(botConfig.notificationInterval, async () => {
    await checkForNewTransactions();
  });

  isMonitoringStarted = true;
  logger.info('✅ Notification service started');
}

export function stopNotificationService(): void {
  if (!isMonitoringStarted || !cronTask) {
    return;
  }

  cronTask.stop();
  cronTask = null;
  isMonitoringStarted = false;
  logger.info('🛑 Notification service stopped');
}

// Проверка новых транзакций
async function checkForNewTransactions(): Promise<void> {
  try {
    logger.debug(`🔍 Checking for new transactions at ${new Date().toISOString()}`);
    
    const allTransactions = await getAllTransactions();
    const currentRowCount = allTransactions.length;
    const notificationData = await getNotificationData();

    logger.debug(`📊 Current state: ${currentRowCount} rows, last known: ${notificationData?.lastRowCount || 'none'}`);

    if (!notificationData) {
      // Первый запуск - сохраняем текущее состояние
      logger.info('🆕 First run - initializing notification data');
      await updateNotificationData({
        lastRowCount: currentRowCount,
        lastChecked: new Date()
      });
      
      return;
    }

    if (currentRowCount > notificationData.lastRowCount) {
      const newTransactionsCount = currentRowCount - notificationData.lastRowCount;
      logger.info(`🆕 Found ${newTransactionsCount} new transaction(s)`);

      // Получаем новые записи (последние добавленные)
      const newTransactions = allTransactions.slice(-newTransactionsCount);
      
      if (newTransactions.length > 0) {
        await notifyUsersAboutNewTransactions(newTransactions);
      }

      // Обновляем данные уведомлений
      await updateNotificationData({
        lastRowCount: currentRowCount,
        lastChecked: new Date()
      });
    } else if (currentRowCount < notificationData.lastRowCount) {
      const deletedTransactionsCount = notificationData.lastRowCount - currentRowCount;
      logger.info(`🗑️ Detected ${deletedTransactionsCount} deleted transaction(s)`);

      // Уведомляем об удалении строк
      await notifyUsersAboutDeletedTransactions(deletedTransactionsCount, currentRowCount);

      // Обновляем данные уведомлений
      await updateNotificationData({
        lastRowCount: currentRowCount,
        lastChecked: new Date()
      });
    } else {
      logger.debug('✅ No changes detected');
    }

  } catch (error) {
    logger.error('❌ Error checking for new transactions:', error as Error);
    logger.error(`❌ Error details: ${error instanceof Error ? error.message : String(error)}`);
    
    // При ошибке API НЕ обновляем состояние уведомлений
    // Это предотвратит ложные уведомления об удалении
    logger.warn('⚠️ API error detected - skipping notification state update to prevent false deletion alerts');
  }
}

async function notifyUsersAboutNewTransactions(transactions: any[]): Promise<void> {
  try {
    const users = await getAllUsersWithNotifications();
    
    if (users.length === 0) {
      logger.debug('📱 No users with notifications enabled');
      return;
    }

    for (const transaction of transactions) {
      // Получаем текущий баланс (после всех транзакций)
      const balanceAfter = await calculateBalance();
      
      // Рассчитываем баланс до этой транзакции
      // Инвертируем текущую операцию чтобы получить баланс до неё
      const operationAmount = transaction.type === 'give' ? transaction.amount : -transaction.amount;
      
      // Простая математика: балансДо = балансПосле - текущаяОперация
      let balanceBeforeAmount;
      
      if (balanceAfter.amount === 0) {
        // Если текущий баланс 0, то до операции был противоположный
        balanceBeforeAmount = -operationAmount;
      } else {
        // Вычисляем сумму до операции
        if (balanceAfter.debtor === botConfig.participants.dmitry) {
          // Дмитрий должен Александру (отрицательный баланс)
          balanceBeforeAmount = -balanceAfter.amount - operationAmount;
        } else {
          // Александр должен Дмитрию (положительный баланс)
          balanceBeforeAmount = balanceAfter.amount - operationAmount;
        }
      }
      
      // Создаем объект баланса до операции
      let balanceBefore;
      if (balanceBeforeAmount === 0) {
        balanceBefore = {
          debtor: '',
          creditor: '',
          amount: 0,
          description: ''
        };
      } else if (balanceBeforeAmount > 0) {
        // Положительный = Александр должен Дмитрию
        balanceBefore = {
          debtor: botConfig.participants.alexander,
          creditor: botConfig.participants.dmitry,
          amount: balanceBeforeAmount,
          description: `${botConfig.participants.alexander} должен ${botConfig.participantsDative.dmitry}`
        };
      } else {
        // Отрицательный = Дмитрий должен Александру
        balanceBefore = {
          debtor: botConfig.participants.dmitry,
          creditor: botConfig.participants.alexander,
          amount: Math.abs(balanceBeforeAmount),
          description: `${botConfig.participants.dmitry} должен ${botConfig.participantsDative.alexander}`
        };
      }
      
      // Форматируем баланс для отображения (только цифры со знаком)
      const formatBalance = (balance: { debtor: string; creditor: string; amount: number; description: string }) => {
        if (balance.amount === 0) {
          return `${botConfig.currency.symbol}0.00`;
        }
        // Если Дмитрий должен Александру - отрицательный баланс
        // Если Александр должен Дмитрию - положительный баланс
        const sign = balance.debtor === botConfig.participants.dmitry ? '-' : '+';
        const formattedAmount = balance.amount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        return `${sign}${botConfig.currency.symbol}${formattedAmount}`;
      };
      
      // Создаем математическую формулу
      const balanceBeforeStr = formatBalance(balanceBefore);
      const balanceAfterStr = formatBalance(balanceAfter);
      const operationSign = transaction.type === 'give' ? '+' : '-';
      const operationAmountStr = `${botConfig.currency.symbol}${transaction.amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
      
      const message = `
🔔 Новая транзакция:
${formatTransactionInput({ amount: transaction.amount, description: transaction.description, type: transaction.type })}
📅 ${transaction.date}

${transaction.type === 'give' ? 
  `💰 ${botConfig.participants.dmitry} → ${botConfig.participants.alexander}: ${botConfig.currency.symbol}${transaction.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}` : 
  `💸 ${botConfig.participants.alexander} → ${botConfig.participants.dmitry}: ${botConfig.currency.symbol}${transaction.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`}

Баланс:
${balanceBeforeStr} ${operationSign} ${operationAmountStr} = 
${balanceAfterStr}
`;

      for (const user of users) {
        try {
          await bot.telegram.sendMessage(user.telegramId, message);
          
          if (botConfig.debug) {
            logger.info(`📤 Notification sent to ${user.firstName} (${user.telegramId})`);
          }
        } catch (error) {
          logger.error(`❌ Failed to send notification to user ${user.telegramId}:`, error as Error);
        }
      }
    }

    logger.info(`✅ Notifications sent for ${transactions.length} new transaction(s) to ${users.length} user(s)`);
  } catch (error) {
    logger.error('❌ Error sending notifications:', error as Error);
  }
}

async function notifyUsersAboutDeletedTransactions(deletedCount: number, currentCount: number): Promise<void> {
  try {
    const users = await getAllUsersWithNotifications();
    
    if (users.length === 0) {
      logger.debug('📱 No users with notifications enabled');
      return;
    }

    // Получаем текущий баланс после удаления
    const currentBalance = await calculateBalance();
    
    // Форматируем баланс для отображения
    const formatBalance = (balance: { debtor: string; creditor: string; amount: number; description: string }) => {
      if (balance.amount === 0) {
        return `${botConfig.currency.symbol}0.00`;
      }
      const sign = balance.debtor === botConfig.participants.dmitry ? '-' : '+';
      const formattedAmount = balance.amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return `${sign}${botConfig.currency.symbol}${formattedAmount}`;
    };
    
    const balanceStr = formatBalance(currentBalance);
    
    const message = `
🗑️ Удалены транзакции из таблицы:
Количество удаленных записей: ${deletedCount}
Осталось транзакций: ${currentCount}

💰 Текущий баланс: ${balanceStr}
`;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegramId, message);
        
        if (botConfig.debug) {
          logger.info(`📤 Deletion notification sent to ${user.firstName} (${user.telegramId})`);
        }
      } catch (error) {
        logger.error(`❌ Failed to send deletion notification to user ${user.telegramId}:`, error as Error);
      }
    }

    logger.info(`✅ Deletion notifications sent to ${users.length} user(s)`);
  } catch (error) {
    logger.error('❌ Error sending deletion notifications:', error as Error);
  }
}

// Функция для принудительной проверки (для тестирования)
export async function forceCheckForNewTransactions(): Promise<void> {
  logger.info('🔍 Forced check for new transactions');
  await checkForNewTransactions();
}

// Функция для сброса данных уведомлений (для тестирования)
export async function resetNotificationData(): Promise<void> {
  const currentRowCount = await getRowCountSafe();
  await updateNotificationData({
    lastRowCount: currentRowCount,
    lastChecked: new Date()
  });
  logger.info('🔄 Notification data reset');
} 