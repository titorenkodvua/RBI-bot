import { ParsedTransaction, TransactionType } from '../types';
import { botConfig } from '../config';

/**
 * Валидирует и парсит сумму из строки
 * @param amountStr - строка с суммой
 * @returns объект с результатом валидации
 */
export function validateAndParseAmount(amountStr: string): { isValid: boolean; amount?: number; error?: string } {
  if (!amountStr || amountStr.trim() === '') {
    return { isValid: false, error: 'Сумма не может быть пустой' };
  }

  // Убираем пробелы
  const cleanAmountStr = amountStr.trim();
  
  // Проверяем что строка содержит только цифры, точку, запятую и знак минус в начале
  const validPattern = /^-?[\d,. ]+$/;
  if (!validPattern.test(cleanAmountStr)) {
    return { isValid: false, error: 'Сумма содержит недопустимые символы' };
  }

  // Заменяем запятую на точку и убираем пробелы (для чисел вида "1 500,50")
  let normalizedAmountStr = cleanAmountStr.replace(/\s+/g, '').replace(',', '.');
  
  // Проверяем что нет более одной точки
  const dotCount = (normalizedAmountStr.match(/\./g) || []).length;
  if (dotCount > 1) {
    return { isValid: false, error: 'Неверный формат числа - слишком много точек' };
  }

  // Парсим число
  const amount = parseFloat(normalizedAmountStr);
  
  if (isNaN(amount)) {
    return { isValid: false, error: 'Не удалось распознать число' };
  }

  // Проверяем что сумма положительная
  if (Math.abs(amount) <= 0) {
    return { isValid: false, error: 'Сумма должна быть больше нуля' };
  }

  // Проверяем разумные пределы (максимум 1 миллион)
  if (Math.abs(amount) > 1000000) {
    return { isValid: false, error: 'Сумма слишком большая (максимум $1,000,000)' };
  }

  // Проверяем что после точки не более 2 цифр (центы)
  const decimalPart = normalizedAmountStr.split('.')[1];
  if (decimalPart && decimalPart.length > 2) {
    return { isValid: false, error: 'Сумма не может содержать более 2 знаков после запятой' };
  }

  return { isValid: true, amount: Math.abs(amount) };
}

export function parseTransactionMessage(message: string): ParsedTransaction | null {
  // Убираем лишние пробелы и разбиваем на части
  const cleanMessage = message.trim().replace(/\s+/g, ' ');
  const parts = cleanMessage.split(' ');
  
  if (parts.length < 2) {
    return null;
  }

  // Первая часть должна быть числом (сумма)
  const amountStr = parts[0];
  const validation = validateAndParseAmount(amountStr);
  
  if (!validation.isValid) {
    return null;
  }

  const amount = validation.amount!;

  // Остальные части - описание
  const description = parts.slice(1).join(' ');
  
  if (!description.trim()) {
    return null;
  }

  // Определяем тип по исходной строке (если была отрицательная)
  const type: TransactionType = amountStr.startsWith('-') ? 'take' : 'give';

  return {
    amount,
    description: description.trim(),
    type
  };
}

export function parseTransactionWithType(message: string): ParsedTransaction | null {
  // Поддерживаем форматы:
  // "+100 перевод на карту" - даю деньги
  // "-50 взял за обед" - беру деньги
  // "100 перевод" - даю деньги (по умолчанию)
  
  const cleanMessage = message.trim().replace(/\s+/g, ' ');
  let type: TransactionType = 'give'; // по умолчанию даю
  let amountStr = '';
  let description = '';

  if (cleanMessage.startsWith('+')) {
    type = 'give';
    const parts = cleanMessage.substring(1).trim().split(' ');
    amountStr = parts[0];
    description = parts.slice(1).join(' ');
  } else if (cleanMessage.startsWith('-')) {
    type = 'take';
    const parts = cleanMessage.substring(1).trim().split(' ');
    amountStr = parts[0];
    description = parts.slice(1).join(' ');
  } else {
    // Обычный формат "сумма описание"
    const parts = cleanMessage.split(' ');
    amountStr = parts[0];
    description = parts.slice(1).join(' ');
  }

  // Валидируем и парсим сумму
  const validation = validateAndParseAmount(amountStr);
  
  if (!validation.isValid) {
    return null;
  }

  if (!description.trim()) {
    return null;
  }

  return {
    amount: validation.amount!,
    description: description.trim(),
    type
  };
}

export function parseTransactionWithValidation(message: string): { success: boolean; transaction?: ParsedTransaction; error?: string } {
  // Поддерживаем форматы:
  // "+100 перевод на карту" - даю деньги
  // "-50 взял за обед" - беру деньги
  // "100 перевод" - даю деньги (по умолчанию)
  
  const cleanMessage = message.trim().replace(/\s+/g, ' ');
  
  if (!cleanMessage) {
    return { success: false, error: 'Сообщение не может быть пустым' };
  }

  let type: TransactionType = 'give'; // по умолчанию даю
  let amountStr = '';
  let description = '';

  if (cleanMessage.startsWith('+')) {
    type = 'give';
    const parts = cleanMessage.substring(1).trim().split(' ');
    amountStr = parts[0];
    description = parts.slice(1).join(' ');
  } else if (cleanMessage.startsWith('-')) {
    type = 'take';
    const parts = cleanMessage.substring(1).trim().split(' ');
    amountStr = parts[0];
    description = parts.slice(1).join(' ');
  } else {
    // Обычный формат "сумма описание"
    const parts = cleanMessage.split(' ');
    if (parts.length < 2) {
      return { success: false, error: 'Укажите сумму и описание. Пример: 100 обед' };
    }
    amountStr = parts[0];
    description = parts.slice(1).join(' ');
  }

  // Валидируем и парсим сумму
  const validation = validateAndParseAmount(amountStr);
  
  if (!validation.isValid) {
    return { success: false, error: validation.error || 'Ошибка валидации суммы' };
  }

  if (!description.trim()) {
    return { success: false, error: 'Описание транзакции не может быть пустым' };
  }

  return {
    success: true,
    transaction: {
      amount: validation.amount!,
      description: description.trim(),
      type
    }
  };
}

export function formatTransactionInput(transaction: ParsedTransaction): string {
  const sign = transaction.type === 'give' ? '+' : '-';
  const emoji = transaction.type === 'give' ? '💰' : '💸';
  const formattedAmount = transaction.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${emoji} ${sign}${botConfig.currency.symbol}${formattedAmount} - ${transaction.description}`;
}

export function getTransactionExamples(): string {
  return `Примеры ввода:
  
💰 Даю деньги:
• 1000 перевод на карту
• +500,50 за продукты
• 200.25 оплата такси

💸 Беру деньги:
• -150,75 взял за обед
• -50 проезд
• -1200,12 за покупки

Формат: <сумма> <описание>
+ означает "даю деньги партнеру" (в USD)
- означает "беру деньги у партнера" (в USD)
Можно использовать как точку, так и запятую для центов`;
} 