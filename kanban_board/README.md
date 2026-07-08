# Kanban Board

Kanban-доска для трекинга задач — аналог Jira. Построена на Next.js 16 + Prisma 7 + SQLite.

## Структура

```
kanban_board/
├── frontend/              # Next.js приложение
│   ├── src/
│   │   ├── app/           # Страницы + API роуты
│   │   ├── components/    # React компоненты
│   │   ├── hooks/         # Хуки
│   │   └── lib/           # prisma.ts, types.ts, utils.ts
│   ├── public/            # Статические файлы
│   └── package.json
├── backend/               # Prisma (схема, миграции)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── prisma.config.ts
│   └── package.json
├── data/                  # Runtime данные
│   ├── dev.db
│   └── .env
├── Dockerfile
└── docker-compose.yml
```

## Возможности

- **Доски** — создание и управление канбан-досками
- **Колонки** — 7 статусов по умолчанию (BACKLOG → DONE) с WIP-лимитами
- **Задачи** — создание, редактирование, drag-and-drop перемещение
- **Эпики** — группировка задач по эпикам
- **Лейблы** — цветные метки для задач
- **Приоритеты** — LOW, MEDIUM, HIGH, CRITICAL
- **Фильтрация** — по эпику, исполнителю, только эпики/без исполнителя
- **Адаптивная вёрстка** — десктоп, планшет, мобильные

## Запуск (разработка)

```bash
# 1. Установить зависимости
cd frontend && npm install
cd ../backend && npm install

# 2. Сгенерировать Prisma client
cd backend && npx prisma generate

# 3. Применить миграции
npx prisma migrate dev

# 4. Запустить dev-сервер
cd ../frontend && npm run dev
```

http://localhost:3000

## Команды

```bash
# Из frontend/
npm run dev          # Dev-сервер
npm run build        # Сборка
npm run lint         # Линтинг
npm run db:generate  # Генерация Prisma client
npm run db:migrate   # Миграции
npm run db:push      # Push схемы
npm run db:studio    # Prisma Studio

# Из backend/
npx prisma generate
npx prisma migrate dev
npx prisma db push
npx prisma studio
```

## Docker

```bash
cd kanban_board
docker compose up -d --build
```

Сервис доступен через Caddy на **https://IP:443**.

### Проверка

```bash
docker compose ps
docker compose logs kanban --tail 50
curl -I http://127.0.0.1:3000
```

Если `3000` — connection refused, контейнер не запущен или упал. Смотри логи выше.

## Технологии

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **DnD**: @hello-pangea/dnd (fork react-beautiful-dnd)
- **ORM**: Prisma 7 + better-sqlite3
- **База**: SQLite
