# RBI Bot - Telegram Bot для взаиморасчетов

Telegram бот для удобного управления взаиморасчетами между двумя людьми через Google Sheets с автоматическими уведомлениями.

## Возможности

- ✅ Добавление новых транзакций (+/-) через Telegram
- ✅ Просмотр текущего баланса взаиморасчетов
- ✅ Автоматические уведомления о новых транзакциях
- ✅ Интеграция с Google Sheets
- ✅ Система взаиморасчетов между двумя участниками

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# Google Sheets Configuration
GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json
SPREADSHEET_ID=your_google_sheets_id_here
SHEET_NAME=Лист1

# Bot Configuration
ADMIN_USER_ID=your_telegram_user_id_here
NOTIFICATION_INTERVAL=*/5 * * * *
DEBUG=true
```

### 3. Настройка Google Sheets API

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google Sheets API
4. Создайте Service Account и скачайте JSON ключ
5. Поместите ключ в папку `credentials/service-account.json`
6. Поделитесь вашей Google таблицей с email из Service Account

### 4. Создание Telegram бота

1. Напишите [@BotFather](https://t.me/botfather) в Telegram
2. Используйте команду `/newbot`
3. Следуйте инструкциям для создания бота
4. Скопируйте токен в переменную `BOT_TOKEN`

### 5. Запуск

```bash
# Разработка
npm run dev

# Продакшн
npm run build
npm start
```

## Команды бота

- `/start` - Запуск и регистрация пользователя
- `/add <сумма> <описание>` - Добавить новую запись
- `/balance` - Показать текущий баланс
- `/history` - Показать последние записи
- `/notifications on/off` - Включить/выключить уведомления

## Структура проекта

```
src/
├── bot/              # Логика Telegram бота
├── services/         # Сервисы (Google Sheets, уведомления)
├── database/         # Работа с MongoDB
├── types/            # TypeScript типы
└── utils/            # Вспомогательные функции
```

## Формат таблицы Google Sheets

Таблица должна содержать следующие колонки:
- A: Дата
- B: Пользователь
- C: Сумма
- D: Описание
- E: Тип (доход/расход)

## Лицензия

MIT 