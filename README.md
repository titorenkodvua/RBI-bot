# RBI Bot - Telegram Bot для взаиморасчетов

Telegram бот для отслеживания взаиморасчетов между участниками с интеграцией Google Sheets.

## 🚀 Деплой

### Option 1: Railway (Рекомендуется)

1. **Подготовка:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Деплой на Railway:**
   - Зайдите на [railway.app](https://railway.app)
   - Подключите GitHub репозиторий
   - Добавьте переменные окружения (см. ниже)
   - Railway автоматически задеплоит бота

3. **Или через CLI:**
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

### Option 2: Render

1. **Настройка:**
   - Зайдите на [render.com](https://render.com)
   - Создайте новый Web Service
   - Подключите GitHub репозиторий
   - Build Command: `npm run build`
   - Start Command: `npm start`

### Option 3: DigitalOcean App Platform

1. **Создание приложения:**
   - Зайдите в DigitalOcean App Platform
   - Подключите GitHub репозиторий
   - Выберите Node.js
   - Build Command: `npm run build`
   - Run Command: `npm start`

### Option 4: Собственный VPS (Ubuntu)

**🚀 Быстрый деплой (автоматический):**
```bash
# Клонируем проект
git clone https://github.com/your-username/RBI-bot.git
cd RBI-bot

# Запускаем автоматический деплой
npm run deploy:vps

# Редактируем переменные и перезапускаем
nano .env
pm2 restart rbi-bot
```

**📋 Ручная установка (пошагово):**

1. **Подготовка сервера:**
   ```bash
   # Обновляем систему
   sudo apt update && sudo apt upgrade -y
   
   # Устанавливаем Node.js 18+
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Устанавливаем PM2 для управления процессами
   sudo npm install -g pm2
   
   # Устанавливаем Git
   sudo apt install git -y
   ```

2. **Загрузка проекта:**
   ```bash
   # Клонируем репозиторий
   git clone https://github.com/your-username/RBI-bot.git
   cd RBI-bot
   
   # Устанавливаем зависимости
   npm install
   
   # Собираем проект
   npm run build
   ```

3. **Настройка переменных:**
   ```bash
   # Копируем .env файл
   cp env.example .env
   nano .env  # Редактируем переменные
   
   # Создаем папку для credentials
   mkdir -p credentials
   # Загружаем service-account.json в credentials/
   ```

4. **Запуск через PM2:**
   ```bash
   # Создаем PM2 конфигурацию
   pm2 start dist/index.js --name "rbi-bot"
   
   # Автозапуск при перезагрузке
   pm2 startup
   pm2 save
   
   # Проверяем статус
   pm2 status
   pm2 logs rbi-bot
   ```

5. **Обновление бота:**
   ```bash
   # Автоматическое обновление
   cd RBI-bot
   npm run update:vps
   
   # Или вручную
   git pull origin main
   npm run build
   pm2 restart rbi-bot
   ```

6. **Дополнительные настройки (опционально):**
   ```bash
   # Настройка firewall
   sudo ufw enable
   sudo ufw allow 22  # SSH
   sudo ufw allow 80  # HTTP (если нужен webhook)
   sudo ufw allow 443 # HTTPS
   
   # Мониторинг логов
   pm2 logs rbi-bot --lines 50
   pm2 monit  # Веб-интерфейс мониторинга
   
   # Бэкап данных (папка data/ с JSON файлами)
   sudo crontab -e
   # Добавить: 0 2 * * * tar -czf /backup/rbi-bot-$(date +\%Y\%m\%d).tar.gz /path/to/RBI-bot/data/
   ```

**Управление ботом на VPS:**
```bash
# Проверить статус
pm2 status

# Просмотреть логи
pm2 logs rbi-bot
pm2 logs rbi-bot --lines 50

# Перезапустить
pm2 restart rbi-bot

# Остановить/запустить
pm2 stop rbi-bot
pm2 start rbi-bot

# Мониторинг в реальном времени
pm2 monit

# Автообновление (каждый день в 3:00)
echo "0 3 * * * cd /path/to/RBI-bot && npm run update:vps" | crontab -
```

**Преимущества собственного VPS:**
- 🔒 Полный контроль над данными и безопасностью
- 💰 Дешевле при длительном использовании ($5-10/месяц)
- ⚡ Лучшая производительность для сложных задач
- 🛠️ Возможность кастомизации сервера
- 📊 Подробные логи и мониторинг

## 🔧 Переменные окружения

Добавьте эти переменные в настройках платформы:

```env
# Telegram Bot Token (получите у @BotFather)
BOT_TOKEN=your_bot_token_here

# Google Sheets ID (из URL таблицы - используется для API и кнопки "Таблица")  
SPREADSHEET_ID=your_google_sheets_id_here

# Google Credentials Path (путь к JSON файлу)
GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json

# Admin Telegram ID 
ADMIN_USER_ID=your_telegram_id_here

# Optional: Webhook (оставьте пустым для polling)
WEBHOOK_URL=
PORT=3000
```

## 📋 Пошаговая настройка

### 1. Создание Telegram бота
```bash
# В Telegram найдите @BotFather
/newbot
# Следуйте инструкциям
# Скопируйте токен в BOT_TOKEN
```

### 2. Настройка Google Sheets API
1. Создайте проект в [Google Cloud Console](https://console.cloud.google.com)
2. Включите Google Sheets API
3. Создайте Service Account
4. Скачайте credentials.json в папку `credentials/service-account.json`
5. Добавьте email сервисного аккаунта в настройки доступа Google Sheets
6. Скопируйте ID таблицы из URL в SPREADSHEET_ID

### 3. Получение Telegram ID
```bash
# Напишите боту @userinfobot
# Скопируйте ваш ID в ADMIN_USER_ID
```

## 🔄 Локальная разработка

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка проекта
npm run build

# Запуск продакшен версии
npm start
```

## 🐳 Docker

```bash
# Сборка образа
docker build -t rbi-bot .

# Запуск контейнера
docker run -d \
  --name rbi-bot \
  -e BOT_TOKEN=your_token \
  -e SPREADSHEET_ID=your_sheets_id \
  -e GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json \
  -e ADMIN_USER_ID=your_id \
  -v $(pwd)/credentials:/app/credentials \
  rbi-bot
```

## 📊 Структура проекта

```
src/
├── bot/           # Логика Telegram бота
├── services/      # Сервисы (Google Sheets, уведомления)
├── storage/       # Файловое хранилище
├── types/         # TypeScript типы
├── utils/         # Утилиты и парсеры
└── config/        # Конфигурация

data/              # JSON файлы с данными (создается автоматически)
├── users.json
└── notifications.json
```

## 🎯 Функции

- ✅ Пошаговое добавление транзакций
- ✅ Интеграция с Google Sheets  
- ✅ Прямая ссылка на Google таблицу из бота
- ✅ Автоматические уведомления
- ✅ Расчет баланса между участниками
- ✅ История операций
- ✅ Inline кнопки для удобства

## 🎮 Интерфейс бота

### Главное меню:
```
[💰 Баланс] [📝 История]
[➕ Добавить] [🔔 Уведомления]  
[📊 Таблица] [ℹ️ Помощь]
```

- **💰 Баланс** - текущее состояние взаиморасчетов
- **📝 История** - последние 10 транзакций
- **➕ Добавить** - пошаговое добавление новой операции
- **🔔 Уведомления** - включение/выключение уведомлений
- **📊 Таблица** - прямая ссылка на Google Sheets
- **ℹ️ Помощь** - подробная справка по использованию

## 🔧 Поддержка

При возникновении вопросов создайте issue в GitHub репозитории. 