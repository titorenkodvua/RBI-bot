import { google, sheets_v4 } from 'googleapis';
import { TransactionRecord, SheetData } from '../types';
import { botConfig } from '../config';
import { logger } from '../utils/logger';

let sheetsService: sheets_v4.Sheets;

/**
 * Форматирует число для Google Sheets с запятой как десятичным разделителем
 */
function formatNumberForSheets(num: number): string {
  // Форматируем число с максимум 2 знаками после запятой
  const formattedNum = num.toFixed(2);
  // Заменяем точку на запятую для совместимости с Google Sheets
  return formattedNum.replace('.', ',');
}

export async function initializeGoogleSheets(): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: botConfig.googleCredentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetsService = google.sheets({ version: 'v4', auth });

    logger.info('✅ Google Sheets API initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize Google Sheets:', error as Error);
    throw error;
  }
}

export async function addTransactionRecord(record: TransactionRecord): Promise<void> {
  try {
    const range = `${botConfig.sheetName}!A:D`;

    // Правильно форматируем число для Google Sheets
    const formattedAmount = record.type === 'give'
      ? formatNumberForSheets(record.amount)
      : formatNumberForSheets(-record.amount);

    const values = [[
      record.date,
      record.user,
      formattedAmount,
      record.description
    ]];

    await sheetsService.spreadsheets.values.append({
      spreadsheetId: botConfig.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values
      }
    });

    logger.info(`✅ Added transaction record: ${record.type === 'give' ? '+' : '-'}${record.amount} - ${record.description}`);
  } catch (error) {
    logger.error('❌ Failed to add transaction record:', error as Error);
    throw error;
  }
}

// Получение данных из таблицы
async function getSheetData(): Promise<SheetData> {
  try {
    const range = `${botConfig.sheetName}!A:D`;
    logger.debug(`🟡 Google Sheets API request: ${range} at ${new Date().toISOString()}`);

    const response = await sheetsService.spreadsheets.values.get({
      spreadsheetId: botConfig.spreadsheetId,
      range
    });

    const rowCount = response.data.values?.length || 0;
    logger.debug(`✅ Google Sheets API response: ${rowCount} rows`);

    return {
      values: response.data.values || [],
      range
    };
  } catch (error) {
    logger.error('❌ Failed to get sheet data:', error as Error);
    logger.error(`❌ Error details: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export function parseSheetRowToTransactionRecord(row: string[], index: number): TransactionRecord | null {
  if (row.length < 4) {
    logger.warn(`Row ${index + 1} has insufficient data`);
    return null;
  }

  const [date, user, amountStr, description] = row;

  // Заменяем запятую на точку для корректного парсинга чисел из Google Sheets
  const normalizedAmountStr = amountStr.replace(/\s+/g, '').replace(',', '.');
  const amount = parseFloat(normalizedAmountStr);

  if (isNaN(amount)) {
    logger.warn(`Invalid amount in row ${index + 1}: ${amountStr}`);
    return null;
  }

  // Определяем тип операции по знаку суммы
  const transactionType: 'give' | 'take' = amount > 0 ? 'give' : 'take';

  return {
    date,
    user,
    amount: Math.abs(amount),
    description,
    type: transactionType
  };
}

export async function getAllTransactions(): Promise<TransactionRecord[]> {
  try {
    const data = await getSheetData();
    const records: TransactionRecord[] = [];

    // Проверяем первую строку - заголовок это или данные
    if (data.values.length > 0) {
      const firstRow = data.values[0];

      // Если первая строка содержит заголовки (Date, User, Amount, Description), пропускаем её
      const hasHeaders = firstRow.length >= 4 &&
        (firstRow[0].toLowerCase().includes('date') ||
          firstRow[1].toLowerCase().includes('user') ||
          firstRow[2].toLowerCase().includes('amount') ||
          firstRow[3].toLowerCase().includes('description'));

      const dataRows = hasHeaders ? data.values.slice(1) : data.values;

      for (let i = 0; i < dataRows.length; i++) {
        const record = parseSheetRowToTransactionRecord(dataRows[i], i + 1);
        if (record) {
          records.push(record);
        }
      }
    }

    logger.debug(`✅ Successfully parsed ${records.length} transactions`);
    return records;
  } catch (error) {
    logger.error('❌ Failed to get all transactions:', error as Error);
    // Выбрасываем ошибку вместо возврата пустого массива
    throw error;
  }
}

export async function getRecentTransactions(count: number = 10): Promise<TransactionRecord[]> {
  try {
    const allTransactions = await getAllTransactions();
    return allTransactions.slice(-count).reverse(); // Показываем новые записи первыми
  } catch (error) {
    logger.error('❌ Failed to get recent transactions:', error as Error);
    // Выбрасываем ошибку вместо возврата пустого массива
    throw error;
  }
}

export async function calculateBalance(): Promise<{ debtor: string; creditor: string; amount: number; description: string }> {
  try {
    const transactions = await getAllTransactions();

    let balance = 0;

    for (const transaction of transactions) {
      if (transaction.type === 'give') {
        balance += transaction.amount;
      } else {
        balance -= transaction.amount;
      }
    }

    const debtor = balance > 0 ? botConfig.participants.dmitry : botConfig.participants.alexander;
    const creditor = balance > 0 ? botConfig.participants.alexander : botConfig.participants.dmitry;
    const description = balance > 0
      ? `${botConfig.participants.alexander} должен ${botConfig.participants.dmitry}`
      : `${botConfig.participants.dmitry} должен ${botConfig.participants.alexander}`;

    logger.debug(`💰 Balance calculated: ${balance} (${debtor} owes)`);

    return {
      debtor,
      creditor,
      amount: Math.abs(balance),
      description
    };
  } catch (error) {
    logger.error('❌ Failed to calculate balance:', error as Error);
    throw error;
  }
} 