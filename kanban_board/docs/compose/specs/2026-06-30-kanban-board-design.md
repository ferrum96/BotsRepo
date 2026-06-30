# Kanban Board Task Tracker — Design Spec

## [S1] Problem

Нужно создать веб-приложение — канбан-доску для отслеживания задач, аналогичную Jira. Приложение должно поддерживать несколько досок (по одной на проект), эпики с привязанными задачами, drag-and-drop перемещение карточек между статусами, фильтрацию и адаптивную верстку.

## [S2] Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Drag-and-Drop**: @hello-pangea/dnd
- **ORM**: Prisma
- **Database**: SQLite (легковесная, для локальной разработки)
- **Icons**: Lucide React

## [S3] Data Models

### Board
- `id`: UUID
- `name`: string
- `createdAt`: datetime
- `updatedAt`: datetime

### Column
- `id`: UUID
- `boardId`: FK → Board
- `title`: string
- `position`: int
- `wipLimit`: int (nullable, null = без лимита)
- `color`: string (hex)

### Epic
- `id`: UUID
- `boardId`: FK → Board
- `title`: string
- `description`: string (nullable)
- `color`: string (hex)
- `createdAt`: datetime

### Task
- `id`: UUID
- `taskNumber`: int (автоинкремент per board, отображается как `KAN-001`)
- `boardId`: FK → Board
- `columnId`: FK → Column
- `epicId`: FK → Epic (nullable)
- `title`: string
- `description`: string (nullable)
- `priority`: enum (LOW, MEDIUM, HIGH, CRITICAL)
- `assignee`: string (nullable)
- `labels`: string[] (через отдельную таблицу или JSON)
- `estimatedTime`: string (nullable, например "2 days")
- `position`: int (порядок внутри колонки)
- `createdAt`: datetime
- `updatedAt`: datetime

### Label
- `id`: UUID
- `boardId`: FK → Board
- `name`: string
- `color`: string (hex)

## [S4] API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/boards` | Список досок |
| POST | `/api/boards` | Создать доску |
| GET | `/api/boards/[id]` | Доска со столбцами |
| PUT | `/api/boards/[id]` | Обновить доску |
| DELETE | `/api/boards/[id]` | Удалить доску |
| POST | `/api/boards/[id]/columns` | Добавить столбец |
| PUT | `/api/columns/[id]` | Обновить столбец |
| DELETE | `/api/columns/[id]` | Удалить столбец |
| GET | `/api/boards/[id]/epics` | Эпики доски |
| POST | `/api/boards/[id]/epics` | Создать эпик |
| PUT | `/api/epics/[id]` | Обновить эпик |
| DELETE | `/api/epics/[id]` | Удалить эпик |
| GET | `/api/boards/[id]/tasks` | Задачи доски (с фильтрами) |
| POST | `/api/boards/[id]/tasks` | Создать задачу |
| PUT | `/api/tasks/[id]` | Обновить задачу |
| DELETE | `/api/tasks/[id]` | Удалить задачу |
| PATCH | `/api/tasks/[id]/move` | Переместить задачу (column + position) |
| POST | `/api/boards/[id]/labels` | Создать метку |

## [S5] UI Components

### Layout
- **Sidebar**: список досок, навигация
- **Header**: название текущей доски, фильтры, кнопка "Новая задача"
- **Board View**: горизонтальный скролл столбцов

### BoardView
- DragDropContext от @hello-pangea/dnd
- Droppable для каждого столбца
- Горизонтальный scroll, sticky заголовки столбцов

### Column
- Заголовок + количество задач / WIP лимит
- Цветовая полоса сверху
- Droppable зона для карточек
- Кнопка "+" для быстрого создания задачи

### TaskCard
- Номер задачи (KAN-001)
- Заголовок
- Цветные метки (теги)
- Аватар исполнителя
- Время (оценка)
- Приоритет (иконка/цвет)
- Draggable

### TaskModal
- Создание/редактирование задачи
- Поля: заголовок, описание, эпик (dropdown), приоритет, исполнитель, метки, время
- Выбор столбца

### EpicModal
- Создание/редактирование эпика
- Поля: название, описание, цвет

### Filters
- Чипсы для фильтрации: "Только эпики", "Без исполнителя"
- Multi-select для исполнителей
- Multi-select для эпиков

## [S6] Default Columns

При создании новой доски автоматически создаются столбцы:
1. BACKLOG (серый)
2. ГРУМИНГ (желтый)
3. HOLD (оранжевый)
4. TO DO (красный)
5. IN PROGRESS (синий)
6. IN REVIEW (фиолетовый)
7. DONE (зеленый)

## [S7] Drag-and-Drop Behavior

- При перетаскивании карточки обновляется `columnId` и `position` задачи
- Оптимистичное обновление UI (сразу перемещаем, потом API)
- При ошибке — откат к предыдущему состоянию
- WIP лимит: визуальное предупреждение при превышении

## [S8] Responsive Design

- Desktop (>1200px): горизонтальный scroll столбцов как в Jira
- Tablet (768-1200px): уменьшенные карточки, компактный view
- Mobile (<768px): вертикальный список столбцов с сворачиванием, bottom sheet для создания задач

## [S9] File Structure

```
kanban_board/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── boards/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── api/
│   │       ├── boards/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── columns/route.ts
│   │       │       ├── epics/route.ts
│   │       │       ├── tasks/route.ts
│   │       │       └── labels/route.ts
│   │       ├── columns/[id]/route.ts
│   │       ├── epics/[id]/route.ts
│   │       └── tasks/[id]/
│   │           ├── route.ts
│   │           └── move/route.ts
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── BoardHeader.tsx
│   │   ├── BoardView.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskModal.tsx
│   │   ├── EpicModal.tsx
│   │   ├── CreateBoardModal.tsx
│   │   ├── Filters.tsx
│   │   └── LabelBadge.tsx
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   └── hooks/
│       └── useBoard.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```
