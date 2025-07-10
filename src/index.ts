import { validateConfig } from './config';
import { connectDatabase, disconnectDatabase } from './database/fileStorage';
import { initializeGoogleSheets } from './services/googleSheets';
import { startNotificationService } from './services/notificationService';
import { bot } from './bot';

async function startBot(): Promise<void> {
  try {
    console.log('🤖 Starting RBI Bot...');
    
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
    
    console.log('✅ RBI Bot started successfully!');
    
    // Graceful shutdown
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Останавливаем бота
    bot.stop(signal);
    
    // Отключаемся от базы данных
    await disconnectDatabase();
    
    console.log('✅ Shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Запускаем бота
startBot(); 