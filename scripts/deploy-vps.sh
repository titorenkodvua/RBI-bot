#!/bin/bash

echo "🚀 RBI Bot VPS Deployment Script"
echo "================================"

# Проверяем что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the RBI-bot project root directory"
    exit 1
fi

# Функция для проверки успешности команды
check_status() {
    if [ $? -eq 0 ]; then
        echo "✅ $1"
    else
        echo "❌ Failed: $1"
        exit 1
    fi
}

echo "🔧 Installing dependencies..."
npm install
check_status "Dependencies installed"

echo "🏗️ Building project..."
npm run build
check_status "Project built"

echo "📝 Setting up environment..."
if [ ! -f ".env" ]; then
    cp env.example .env
    echo "📋 Created .env file from example"
    echo "⚠️  Please edit .env file with your credentials before running the bot"
else
    echo "✅ .env file already exists"
fi

echo "📁 Creating credentials directory..."
mkdir -p credentials
if [ ! -f "credentials/service-account.json" ]; then
    echo "⚠️  Please add your Google Service Account JSON file to credentials/service-account.json"
else
    echo "✅ Google credentials found"
fi

echo "📁 Creating data directory..."
mkdir -p data

echo "🔍 Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
    check_status "PM2 installed"
else
    echo "✅ PM2 already installed"
fi

echo "🚀 Starting bot with PM2..."
pm2 delete rbi-bot 2>/dev/null || true  # Delete if exists, ignore error
pm2 start dist/index.js --name "rbi-bot"
check_status "Bot started with PM2"

echo "💾 Saving PM2 configuration..."
pm2 save
pm2 startup

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📊 Useful commands:"
echo "  pm2 status         - Check bot status"
echo "  pm2 logs rbi-bot   - View bot logs"
echo "  pm2 restart rbi-bot - Restart bot"
echo "  pm2 stop rbi-bot   - Stop bot"
echo "  pm2 monit          - Web monitoring interface"
echo ""
echo "🔧 Next steps:"
echo "  1. Edit .env file: nano .env"
echo "  2. Add Google credentials: credentials/service-account.json"
echo "  3. Restart bot: pm2 restart rbi-bot"
echo ""
echo "📋 Current status:"
pm2 status 