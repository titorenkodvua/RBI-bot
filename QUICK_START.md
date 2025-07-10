# 🚀 Быстрый старт RBI Bot

## Шаг 1: Установка

```bash
npm install
npm run setup
```

## Шаг 2: Создание Telegram бота

1. Напишите [@BotFather](https://t.me/botfather)
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен

## Шаг 3: Настройка Google Sheets

### Создание Service Account:
1. [Google Cloud Console](https://console.cloud.google.com/) → Новый проект
2. APIs & Services → Library → Google Sheets API → Включить
3. APIs & Services → Credentials → Create Credentials → Service Account
4. Скачать JSON ключ → Переименовать в `service-account.json`
5. Поместить в папку `credentials/`

### Настройка таблицы:
1. Создайте Google Sheets таблицу
2. Добавьте заголовки: `Дата | Пользователь | Сумма | Описание | Тип`
3. Share → Добавить email из `service-account.json` (поле `client_email`)
4. Скопировать ID таблицы из URL

## Шаг 4: Конфигурация

Отредактируйте файл `.env`:

```bash
# Токен от BotFather
BOT_TOKEN=your_bot_token_here

# ID таблицы Google Sheets
SPREADSHEET_ID=your_spreadsheet_id_here

# Ваш Telegram ID (для администратора)
ADMIN_USER_ID=your_telegram_user_id

# MongoDB (опционально - можно использовать облачный)
MONGODB_URI=mongodb://localhost:27017/rbi-bot
```

## Шаг 5: Запуск

```bash
# Разработка
npm run dev

# Продакшн
npm run build
npm start
```

## 📱 Использование бота

### Команды:
- `/start` - Регистрация
- `/add 150 обед` - Добавить расход
- `/balance` - Показать баланс
- `/history` - История операций
- `/notifications on/off` - Уведомления

### Быстрое добавление:
Просто отправьте: `150 обед в кафе`

### Доходы:
Используйте знак +: `+5000 зарплата`

## 🔧 Получить Telegram User ID

1. Напишите [@userinfobot](https://t.me/userinfobot)
2. Скопируйте ваш ID
3. Добавьте в `ADMIN_USER_ID`

## ⚡ Docker (опционально)

```bash
# MongoDB через Docker
docker run -d --name mongo -p 27017:27017 mongo:latest
```

## 🔍 Отладка

- Установите `DEBUG=true` в `.env`
- Проверьте логи: `npm run dev`
- Убедитесь что MongoDB запущен
- Проверьте права доступа к Google Sheets

## 📊 Формат таблицы

| Дата      | Пользователь | Сумма | Описание     | Тип     |
|-----------|--------------|-------|--------------|---------|
| 15.12.2024| Дмитрий      | 150   | Обед в кафе  | expense |
| 15.12.2024| Дмитрий      | 5000  | Зарплата     | income  |

Готово! 🎉 