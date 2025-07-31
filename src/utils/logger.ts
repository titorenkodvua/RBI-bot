import { formatDateTimeWithSeconds } from './dateHelper';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = formatDateTimeWithSeconds(new Date());
    return `[${timestamp}] ${level}: ${message}`;
  }

  debug(message: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message));
    }
  }

  info(message: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message));
    }
  }

  warn(message: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message));
    }
  }

  error(message: string, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMessage = error ? `${message}: ${error.message}` : message;
      console.error(this.formatMessage('ERROR', errorMessage));
      if (error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Создаем логгер с правильным уровнем после загрузки .env
function createLogger(): Logger {
  const debugEnabled = process.env.DEBUG === 'true';
  console.log('🔍 Logger initialization:');
  console.log('DEBUG env:', process.env.DEBUG);
  console.log('debugEnabled:', debugEnabled);
  console.log('LogLevel:', debugEnabled ? 'DEBUG' : 'INFO');

  return new Logger(debugEnabled ? LogLevel.DEBUG : LogLevel.INFO);
}

// Экспортируем функцию создания логгера
export { createLogger };

// Создаем глобальный экземпляр логгера (будет пересоздан после загрузки .env)
export let logger = new Logger(LogLevel.INFO);

// Функция для инициализации логгера после загрузки .env
export function initializeLogger(): void {
  logger = createLogger();
} 