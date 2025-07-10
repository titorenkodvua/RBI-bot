#!/bin/bash

echo "🚀 Setting up RBI Bot..."

# Создаем .env файл если его нет
if [ ! -f .env ]; then
    echo "📝 Creating .env file from example..."
    cp env.example .env
    echo "✅ .env file created. Please edit it with your credentials."
else
    echo "✅ .env file already exists"
fi

# Создаем папку для credentials если её нет
if [ ! -d credentials ]; then
    echo "📁 Creating credentials directory..."
    mkdir -p credentials
fi

# Проверяем наличие service-account.json
if [ ! -f credentials/service-account.json ]; then
    echo "⚠️  Please add your Google Service Account JSON file to credentials/service-account.json"
    echo "📖 See credentials/README.md for instructions"
else
    echo "✅ Google Service Account file found"
fi

echo ""
echo "🔧 Next steps:"
echo "1. Edit .env file with your credentials"
echo "2. Add Google Service Account JSON to credentials/service-account.json"
echo "3. Create Telegram bot with @BotFather"
echo "4. Set up Google Sheets (see README.md)"
echo "5. Start MongoDB (if using local instance)"
echo "6. Run: npm run dev"
echo ""
echo "📚 For detailed setup instructions, see README.md" 