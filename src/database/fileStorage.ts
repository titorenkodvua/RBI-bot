import { User, NotificationData } from '../types';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// Создаем папку data если её нет
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Чтение пользователей из файла
async function readUsers(): Promise<User[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Сохранение пользователей в файл
async function saveUsers(users: User[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

// Чтение данных уведомлений
async function readNotificationData(): Promise<NotificationData | null> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Преобразуем строку даты обратно в Date объект
    if (parsed.lastChecked) {
      parsed.lastChecked = new Date(parsed.lastChecked);
    }
    return parsed;
  } catch {
    return null;
  }
}

// Сохранение данных уведомлений
async function saveNotificationData(data: NotificationData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(data, null, 2));
}

// Подключение к базе данных
export async function connectDatabase(): Promise<void> {
  try {
    // Создаем директории если их нет
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    logger.info('✅ Using file storage (JSON files)');
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error as Error);
    throw error;
  }
}

// Отключение от базы данных
export async function disconnectDatabase(): Promise<void> {
  try {
    logger.info('👋 File storage disconnected');
  } catch (error) {
    logger.error('❌ Error disconnecting from database:', error as Error);
  }
}

export async function findUserByTelegramId(telegramId: number): Promise<User | null> {
  const users = await readUsers();
  return users.find(user => user.telegramId === telegramId) || null;
}

export async function createUser(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
  const users = await readUsers();
  const newUser: User = {
    ...userData,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  users.push(newUser);
  await saveUsers(users);
  return newUser;
}

export async function updateUser(telegramId: number, updates: Partial<User>): Promise<User | null> {
  const users = await readUsers();
  const userIndex = users.findIndex(user => user.telegramId === telegramId);
  
  if (userIndex === -1) {
    return null;
  }
  
  users[userIndex] = { ...users[userIndex], ...updates, updatedAt: new Date() };
  await saveUsers(users);
  return users[userIndex];
}

export async function getAllUsersWithNotifications(): Promise<User[]> {
  const users = await readUsers();
  return users.filter(user => user.notificationsEnabled);
}

export async function getNotificationData(): Promise<NotificationData | null> {
  return await readNotificationData();
}

export async function updateNotificationData(data: NotificationData): Promise<void> {
  await saveNotificationData(data);
} 