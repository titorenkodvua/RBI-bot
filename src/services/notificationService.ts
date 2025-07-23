import * as cron from 'node-cron';
import { getRowCountSafe, getAllTransactions, calculateBalance } from './googleSheets';
import { getNotificationData, updateNotificationData, getAllUsersWithNotifications } from '../database/fileStorage';
import { bot } from '../bot';
import { botConfig } from '../config';
import { formatTransactionInput } from '../utils/messageParser';

let isMonitoringStarted = false;
let cronTask: cron.ScheduledTask | null = null;

export function startNotificationService(): void {
  if (isMonitoringStarted) {
    console.log('⚠️ Notification service already started');
    return;
  }

  console.log(`📅 Starting notification service with interval: ${botConfig.notificationInterval}`);
  
  cronTask = cron.schedule(botConfig.notificationInterval, async () => {
    await checkForNewTransactions();
  });

  isMonitoringStarted = true;
  console.log('✅ Notification service started');
}

export function stopNotificationService(): void {
  if (!isMonitoringStarted || !cronTask) {
    return;
  }

  cronTask.stop();
  cronTask = null;
  isMonitoringStarted = false;
  console.log('🛑 Notification service stopped');
}

async function checkForNewTransactions(): Promise<void> {
  try {
    console.log(`🔍 Checking for new transactions at ${new Date().toISOString()}`);
    
    const allTransactions = await getAllTransactions();
    const currentRowCount = allTransactions.length;
    const notificationData = await getNotificationData();

    console.log(`📊 Current state: ${currentRowCount} rows, last known: ${notificationData?.lastRowCount || 'none'}`);

    if (!notificationData) {
      // Первый запуск - сохраняем текущее состояние
      console.log('🆕 First run - initializing notification data');
      await updateNotificationData({
        lastRowCount: currentRowCount,
        lastChecked: new Date()
      });
      
      return;
    }

    if (currentRowCount > notificationData.lastRowCount) {
      const newTransactionsCount = currentRowCount - notificationData.lastRowCount;
      console.log(`🆕 Found ${newTransactionsCount} new transaction(s)`);

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
      console.log(`🗑️ Detected ${deletedTransactionsCount} deleted transaction(s)`);

      // Уведомляем об удалении строк
      await notifyUsersAboutDeletedTransactions(deletedTransactionsCount, currentRowCount);

      // Обновляем данные уведомлений
      await updateNotificationData({
        lastRowCount: currentRowCount,
        lastChecked: new Date()
      });
    } else {
      console.log('✅ No changes detected');
    }

  } catch (error) {
    console.error('❌ Error checking for new transactions:', error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      status: (error as any)?.status
    });
    // НЕ обновляем состояние уведомлений при ошибке API
    // НЕ отправляем уведомления об удалении строк
    // Просто логируем ошибку и ждем следующего цикла
  }
}

async function notifyUsersAboutNewTransactions(transactions: any[]): Promise<void> {
  try {
    const users = await getAllUsersWithNotifications();
    
    if (users.length === 0) {
      console.log('📱 No users with notifications enabled');
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
            console.log(`📤 Notification sent to ${user.firstName} (${user.telegramId})`);
          }
        } catch (error) {
          console.error(`❌ Failed to send notification to user ${user.telegramId}:`, error);
        }
      }
    }

    console.log(`✅ Notifications sent for ${transactions.length} new transaction(s) to ${users.length} user(s)`);
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
  }
}

async function notifyUsersAboutDeletedTransactions(deletedCount: number, currentCount: number): Promise<void> {
  try {
    const users = await getAllUsersWithNotifications();
    
    if (users.length === 0) {
      console.log('📱 No users with notifications enabled');
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
          console.log(`📤 Deletion notification sent to ${user.firstName} (${user.telegramId})`);
        }
      } catch (error) {
        console.error(`❌ Failed to send deletion notification to user ${user.telegramId}:`, error);
      }
    }

    console.log(`✅ Deletion notifications sent to ${users.length} user(s)`);
  } catch (error) {
    console.error('❌ Error sending deletion notifications:', error);
  }
}

// Функция для принудительной проверки (для тестирования)
export async function forceCheckForNewTransactions(): Promise<void> {
  console.log('🔍 Forced check for new transactions');
  await checkForNewTransactions();
}

// Функция для сброса данных уведомлений (для тестирования)
export async function resetNotificationData(): Promise<void> {
  const currentRowCount = await getRowCountSafe();
  await updateNotificationData({
    lastRowCount: currentRowCount,
    lastChecked: new Date()
  });
  console.log('🔄 Notification data reset');
} 