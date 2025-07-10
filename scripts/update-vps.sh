#!/bin/bash

echo "🔄 RBI Bot Update Script"
echo "========================"

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

echo "📥 Pulling latest changes from git..."
git pull origin main
check_status "Git pull completed"

echo "📦 Installing/updating dependencies..."
npm install
check_status "Dependencies updated"

echo "🏗️ Building project..."
npm run build
check_status "Project built"

echo "🔄 Restarting bot with PM2..."
pm2 restart rbi-bot
check_status "Bot restarted"

echo "💾 Saving PM2 configuration..."
pm2 save

echo ""
echo "✅ Update completed successfully!"
echo ""
echo "📋 Current status:"
pm2 status

echo ""
echo "📊 Recent logs:"
pm2 logs rbi-bot --lines 10 