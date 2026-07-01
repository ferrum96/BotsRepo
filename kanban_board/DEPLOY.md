# Деплой Kanban Board на VPS

## Быстрый старт с Docker

1. Клонируйте репозиторий на сервер:
```bash
git clone <your-repo-url>
cd kanban_board
```

2. Запустите деплой:
```bash
./deploy.sh
```

3. Откройте в браузере:
```
http://your-server-ip:3000
```

## Ручная установка (без Docker)

1. Установите Node.js 20+:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. Установите зависимости:
```bash
npm install
```

3. Настройте окружение:
```bash
cp .env.example .env
# Отредактируйте .env если нужно
```

4. Соберите проект:
```bash
npx prisma generate
npm run build
```

5. Запустите:
```bash
npm start
```

## Настройка nginx (рекомендуется)

```nginx
server {
    listen 80;
    server_name kanban.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Хранение данных

База данных SQLite хранится в файле `data/prod.db`.
При использовании Docker этот файл монтируется как volume.
