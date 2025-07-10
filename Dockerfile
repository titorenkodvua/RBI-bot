# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Собираем проект
RUN npm run build

# Открываем порт для webhook (если понадобится)
EXPOSE 3000

# Создаем директории для данных
RUN mkdir -p data

# Запускаем бота
CMD ["npm", "start"] 