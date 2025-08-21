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

function getWhitelistUsers(): number[] {
  const allowedUsersStr = process.env.ALLOWED_USERS;
  if (!allowedUsersStr) {
    return [];
  }

  try {
    return allowedUsersStr
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));
  } catch (error) {
    logger.warn('⚠️ Failed to parse ALLOWED_USERS, using empty whitelist');
    return [];
  }
}

export const botConfig: BotConfig = {
  token: getRequiredEnvVar('BOT_TOKEN'),
  adminUserId: parseInt(getRequiredEnvVar('ADMIN_USER_ID'), 10),
  googleCredentialsPath: getRequiredEnvVar('GOOGLE_CREDENTIALS_PATH'),
  spreadsheetId: getRequiredEnvVar('SPREADSHEET_ID'),
  sheetName: getOptionalEnvVar('SHEET_NAME', 'Лист1'),
  notificationInterval: getOptionalEnvVar('NOTIFICATION_INTERVAL', '*/15 * * * * *'),
  debug: getOptionalEnvVar('DEBUG', 'false') === 'true',
  allowedUsers: getWhitelistUsers(),
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

  if (botConfig.allowedUsers.length === 0) {
    logger.warn('⚠️ No users in whitelist - bot will be accessible to everyone');
  } else {
    logger.info(`✅ Whitelist configured with ${botConfig.allowedUsers.length} users`);
  }

  logger.info('✅ Configuration validated successfully');
} 