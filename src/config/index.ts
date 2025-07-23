import { config } from 'dotenv';
import { BotConfig } from '../types';
import { logger } from '../utils/logger';

config();

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const botConfig: BotConfig = {
  token: getRequiredEnvVar('BOT_TOKEN'),
  adminUserId: parseInt(getRequiredEnvVar('ADMIN_USER_ID'), 10),
  googleCredentialsPath: getRequiredEnvVar('GOOGLE_CREDENTIALS_PATH'),
  spreadsheetId: getRequiredEnvVar('SPREADSHEET_ID'),
  sheetName: getOptionalEnvVar('SHEET_NAME', 'Лист1'),
  notificationInterval: getOptionalEnvVar('NOTIFICATION_INTERVAL', '*/15 * * * * *'),
  debug: getOptionalEnvVar('DEBUG', 'false') === 'true',
  participants: {
    dmitry: 'Дмитрий',
    alexander: 'Александр'
  },
  participantsDative: {
    dmitry: 'Дмитрию',
    alexander: 'Александру'
  },
  currency: {
    code: 'USD',
    symbol: '$'
  }
};

export function validateConfig(): void {
  if (!botConfig.token) {
    throw new Error('BOT_TOKEN is required');
  }
  
  if (isNaN(botConfig.adminUserId)) {
    throw new Error('ADMIN_USER_ID must be a valid number');
  }
  
  if (!botConfig.spreadsheetId) {
    throw new Error('SPREADSHEET_ID is required');
  }
  
  if (!botConfig.googleCredentialsPath) {
    throw new Error('GOOGLE_CREDENTIALS_PATH is required');
  }
  
  logger.info('✅ Configuration validated successfully');
} 