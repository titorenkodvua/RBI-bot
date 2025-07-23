import { format, parse, isValid } from 'date-fns';
import { ru } from 'date-fns/locale';

export function formatDate(date: Date): string {
  return format(date, 'dd.MM.yyyy', { locale: ru });
}

export function formatDateTime(date: Date): string {
  return format(date, 'dd.MM.yyyy HH:mm', { locale: ru });
}

export function formatDateTimeWithSeconds(date: Date): string {
  return format(date, 'dd.MM.yyyy HH:mm:ss', { locale: ru });
}

export function parseDate(dateString: string): Date | null {
  try {
    // Пробуем разные форматы
    const formats = ['dd.MM.yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];
    
    for (const formatString of formats) {
      const parsed = parse(dateString, formatString, new Date());
      if (isValid(parsed)) {
        return parsed;
      }
    }
    
    // Пробуем стандартный Date.parse
    const parsed = new Date(dateString);
    if (isValid(parsed)) {
      return parsed;
    }
    
    return null;
  } catch {
    return null;
  }
}

export function isDateInRange(date: Date, startDate: Date, endDate: Date): boolean {
  return date >= startDate && date <= endDate;
}

export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function getStartOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

export function getEndOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
} 