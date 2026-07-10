# Kanban Board

Kanban-доска для трекинга задач. Построена на **React 19 + Vite + Hono + Drizzle + SQLite**.

## Структура

```
kanban_board/
├── src/
│   ├── client/            # React SPA (Vite)
│   │   ├── components/    # BoardView, TaskCard, KanbanColumn, …
│   │   ├── hooks/
│   │   └── lib/           # api.ts, types.ts
│   └── server/            # Hono API
│       ├── index.ts       # точка входа
│       ├── db/            # Drizzle schema + SQLite
│       └── routes/        # boards, columns, tasks, epics, labels
├── drizzle/               # SQL-миграции
├── data/                  # SQLite (prod.db / dev.db)
├── docker-compose.dev.yml
├── Dockerfile / Dockerfile.dev
└── package.json
```

## Возможности

- **Доски** — создание и управление канбан-досками
- **Колонки** — статусы с WIP-лимитами
- **Задачи** — создание, редактирование, drag-and-drop
- **Эпики** — группировка задач
- **Лейблы** — цветные метки
- **Приоритеты** — LOW, MEDIUM, HIGH, CRITICAL
- **Фильтрация** — по эпику, исполнителю
- **Адаптивная вёрстка**

## Запуск (разработка)

### Docker (рекомендуется)

```bash
cd kanban_board
docker compose -f docker-compose.dev.yml up --build
```

| URL | Описание |
|-----|----------|
| http://localhost:5173 | UI (Vite dev) |
| http://localhost:3001 | API (Hono) |

См. [DEV.md](../DEV.md).

### Без Docker

```bash
npm install
npm run dev
```

Команда `dev` параллельно запускает Hono-сервер и Vite.

## Команды

```bash
npm run dev          # Hono + Vite (concurrently)
npm run build        # vite build + tsc (server)
npm run start        # node dist/server/index.js
npm run db:generate  # drizzle-kit generate
npm run db:migrate   # drizzle-kit migrate
npm run db:push      # drizzle-kit push
npm run db:studio    # drizzle-kit studio
```

## Production (VPS)

На сервере kanban работает через **systemd** (`kanban.service`):

| URL | Внутренний порт |
|-----|----------------|
| http://IP:448 | 127.0.0.1:3002 |

Сборка и деплой: [DEPLOY.md](../DEPLOY.md).

```bash
systemctl status kanban
journalctl -u kanban -f
```

## Технологии

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **Backend:** Hono, Node.js
- **DnD:** @hello-pangea/dnd
- **ORM:** Drizzle ORM + better-sqlite3
- **База:** SQLite
