import { validateConfig } from './config';
import { connectDatabase, disconnectDatabase } from './database/fileStorage';
import { initializeGoogleSheets } from './services/googleSheets';
import { startNotificationService, stopNotificationService } from './services/notificationService';
import { bot } from './bot';
import { logger } from './utils/logger';

async function startBot() {
  try {
    logger.info('🤖 Starting RBI Bot...');
    
    // Проверяем конфигурацию
    validateConfig();
    
    // Подключаемся к MongoDB
    await connectDatabase();
    
    // Инициализируем Google Sheets API
    await initializeGoogleSheets();
    
    // Запускаем сервис уведомлений
    startNotificationService();
    
    // Запускаем бота
    await bot.launch();
    
    logger.info('✅ RBI Bot started successfully!');
    
    // Обработка graceful shutdown
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
  } catch (error) {
    logger.error('❌ Failed to start bot:', error as Error);
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string) {
  logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Останавливаем сервис уведомлений
    stopNotificationService();
    
    // Останавливаем бота
    await bot.stop(signal);
    
    // Отключаемся от базы данных
    await disconnectDatabase();
    
    logger.info('✅ Shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error as Error);
    process.exit(1);
  }
}

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Запускаем бота
startBot(); 