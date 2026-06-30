# Kanban Board Task Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Jira-like kanban board with drag-and-drop, epics, tasks, and responsive design.

**Architecture:** Next.js App Router with SQLite via Prisma, @hello-pangea/dnd for drag-and-drop, Tailwind CSS for styling. Server-side API routes handle CRUD, client components manage board state with optimistic updates.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, @hello-pangea/dnd, Prisma, SQLite, Lucide React

---

### Task 1: Project Scaffolding

**Covers:** [S2]

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `next.config.js`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize Next.js project**

```bash
npx create-next-app@latest kanban_board --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git --use-npm
```

- [ ] **Step 2: Install additional dependencies**

```bash
cd kanban_board && npm install @hello-pangea/dnd lucide-react @prisma/client
npm install -D prisma
```

- [ ] **Step 3: Initialize Prisma**

```bash
npx prisma init --datasource-provider sqlite
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: initialize Next.js project with dependencies"
```

---

### Task 2: Database Schema

**Covers:** [S3]

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Define Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Board {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  columns   Column[]
  epics     Epic[]
  tasks     Task[]
  labels    Label[]
}

model Column {
  id        String   @id @default(uuid())
  boardId   String
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  title     String
  position  Int
  wipLimit  Int?
  color     String   @default("#6B7280")
  tasks     Task[]

  @@unique([boardId, position])
}

model Epic {
  id          String   @id @default(uuid())
  boardId     String
  board       Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  title       String
  description String?
  color       String   @default("#3B82F6")
  createdAt   DateTime @default(now())
  tasks       Task[]
}

model Task {
  id            String   @id @default(uuid())
  taskNumber    Int
  boardId       String
  board         Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  columnId      String
  column        Column   @relation(fields: [columnId], references: [id], onDelete: Cascade)
  epicId        String?
  epic          Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)
  title         String
  description   String?
  priority      String   @default("MEDIUM")
  assignee      String?
  estimatedTime String?
  position      Int
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  labels        TaskLabel[]

  @@unique([boardId, taskNumber])
  @@unique([columnId, position])
}

model Label {
  id      String      @id @default(uuid())
  boardId String
  board   Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  name    String
  color   String      @default("#6B7280")
  tasks   TaskLabel[]
}

model TaskLabel {
  taskId  String
  task    Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  labelId String
  label   Label  @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([taskId, labelId])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name init
```

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add database schema with Prisma"
```

---

### Task 3: Prisma Client & Types

**Covers:** [S3]

**Files:**
- Create: `src/lib/prisma.ts`, `src/lib/types.ts`, `src/lib/utils.ts`

- [ ] **Step 1: Create Prisma client singleton**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 2: Create TypeScript types**

```typescript
import { Board, Column, Epic, Task, Label, TaskLabel } from '@prisma/client'

export type BoardWithColumns = Board & {
  columns: Column[]
}

export type BoardWithDetails = Board & {
  columns: (Column & {
    tasks: TaskWithDetails[]
  })[]
}

export type TaskWithDetails = Task & {
  epic: Epic | null
  labels: (TaskLabel & {
    label: Label
  })[]
}

export type EpicWithTasks = Epic & {
  tasks: Task[]
}

export type CreateTaskInput = {
  title: string
  description?: string
  columnId: string
  epicId?: string
  priority?: string
  assignee?: string
  estimatedTime?: string
  labelIds?: string[]
}

export type UpdateTaskInput = Partial<CreateTaskInput>

export type MoveTaskInput = {
  columnId: string
  position: number
}

export type CreateBoardInput = {
  name: string
}

export type CreateEpicInput = {
  title: string
  description?: string
  color?: string
}

export type CreateLabelInput = {
  name: string
  color?: string
}

export type TaskFilters = {
  epicId?: string
  assignee?: string
  epicsOnly?: boolean
  noAssignee?: boolean
}
```

- [ ] **Step 3: Create utility functions**

```typescript
export function generateTaskNumber(boardId: string, lastNumber: number): number {
  return lastNumber + 1
}

export function formatTaskId(number: number): string {
  return `KAN-${String(number).padStart(3, '0')}`
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return 'text-red-600'
    case 'HIGH': return 'text-orange-500'
    case 'MEDIUM': return 'text-yellow-500'
    case 'LOW': return 'text-green-500'
    default: return 'text-gray-500'
  }
}

export function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '🔴'
    case 'HIGH': return '🟠'
    case 'MEDIUM': return '🟡'
    case 'LOW': return '🟢'
    default: return '⚪'
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "feat: add Prisma client, types, and utilities"
```

---

### Task 4: Board API Routes

**Covers:** [S4]

**Files:**
- Create: `src/app/api/boards/route.ts`, `src/app/api/boards/[id]/route.ts`, `src/app/api/boards/[id]/columns/route.ts`

- [ ] **Step 1: Create boards list/create endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateBoardInput } from '@/lib/types'

const DEFAULT_COLUMNS = [
  { title: 'BACKLOG', position: 0, color: '#6B7280' },
  { title: 'ГРУМИНГ', position: 1, color: '#EAB308' },
  { title: 'HOLD', position: 2, color: '#F97316' },
  { title: 'TO DO', position: 3, color: '#EF4444' },
  { title: 'IN PROGRESS', position: 4, color: '#3B82F6' },
  { title: 'IN REVIEW', position: 5, color: '#8B5CF6' },
  { title: 'DONE', position: 6, color: '#22C55E' },
]

export async function GET() {
  const boards = await prisma.board.findMany({
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(boards)
}

export async function POST(request: Request) {
  const body: CreateBoardInput = await request.json()
  
  const board = await prisma.board.create({
    data: {
      name: body.name,
      columns: {
        create: DEFAULT_COLUMNS,
      },
    },
    include: { columns: true },
  })
  
  return NextResponse.json(board, { status: 201 })
}
```

- [ ] **Step 2: Create single board endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const board = await prisma.board.findUnique({
    where: { id: params.id },
    include: {
      columns: {
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            orderBy: { position: 'asc' },
            include: {
              epic: true,
              labels: { include: { label: true } },
            },
          },
        },
      },
      epics: true,
      labels: true,
    },
  })
  
  if (!board) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  }
  
  return NextResponse.json(board)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  
  const board = await prisma.board.update({
    where: { id: params.id },
    data: { name: body.name },
  })
  
  return NextResponse.json(board)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  await prisma.board.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create columns endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  
  const maxPosition = await prisma.column.aggregate({
    where: { boardId: params.id },
    _max: { position: true },
  })
  
  const column = await prisma.column.create({
    data: {
      boardId: params.id,
      title: body.title,
      position: (maxPosition._max.position ?? -1) + 1,
      color: body.color || '#6B7280',
      wipLimit: body.wipLimit,
    },
  })
  
  return NextResponse.json(column, { status: 201 })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/boards/
git commit -m "feat: add board API routes"
```

---

### Task 5: Task API Routes

**Covers:** [S4]

**Files:**
- Create: `src/app/api/boards/[id]/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/app/api/tasks/[id]/move/route.ts`

- [ ] **Step 1: Create tasks list/create endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateTaskInput, TaskFilters } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url)
  
  const filters: TaskFilters = {
    epicId: searchParams.get('epicId') || undefined,
    assignee: searchParams.get('assignee') || undefined,
    epicsOnly: searchParams.get('epicsOnly') === 'true',
    noAssignee: searchParams.get('noAssignee') === 'true',
  }
  
  const where: any = { boardId: params.id }
  
  if (filters.epicId) where.epicId = filters.epicId
  if (filters.assignee) where.assignee = filters.assignee
  if (filters.noAssignee) where.assignee = null
  
  const tasks = await prisma.task.findMany({
    where,
    include: {
      epic: true,
      labels: { include: { label: true } },
      column: true,
    },
    orderBy: { position: 'asc' },
  })
  
  return NextResponse.json(tasks)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body: CreateTaskInput = await request.json()
  
  const lastTask = await prisma.task.findFirst({
    where: { boardId: params.id },
    orderBy: { taskNumber: 'desc' },
  })
  
  const maxPosition = await prisma.task.aggregate({
    where: { columnId: body.columnId },
    _max: { position: true },
  })
  
  const task = await prisma.task.create({
    data: {
      boardId: params.id,
      taskNumber: (lastTask?.taskNumber ?? 0) + 1,
      columnId: body.columnId,
      title: body.title,
      description: body.description,
      epicId: body.epicId,
      priority: body.priority || 'MEDIUM',
      assignee: body.assignee,
      estimatedTime: body.estimatedTime,
      position: (maxPosition._max.position ?? -1) + 1,
      labels: body.labelIds?.length
        ? {
            create: body.labelIds.map((labelId) => ({
              labelId,
            })),
          }
        : undefined,
    },
    include: {
      epic: true,
      labels: { include: { label: true } },
    },
  })
  
  return NextResponse.json(task, { status: 201 })
}
```

- [ ] **Step 2: Create single task endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UpdateTaskInput } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      epic: true,
      labels: { include: { label: true } },
      column: true,
    },
  })
  
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  
  return NextResponse.json(task)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body: UpdateTaskInput = await request.json()
  
  const { labelIds, ...data } = body
  
  if (labelIds) {
    await prisma.taskLabel.deleteMany({
      where: { taskId: params.id },
    })
  }
  
  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...data,
      labels: labelIds
        ? {
            create: labelIds.map((labelId) => ({
              labelId,
            })),
          }
        : undefined,
    },
    include: {
      epic: true,
      labels: { include: { label: true } },
    },
  })
  
  return NextResponse.json(task)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  await prisma.task.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create task move endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MoveTaskInput } from '@/lib/types'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body: MoveTaskInput = await request.json()
  
  const task = await prisma.task.findUnique({
    where: { id: params.id },
  })
  
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: {
        columnId: task.columnId,
        position: { gt: task.position },
      },
      data: {
        position: { decrement: 1 },
      },
    })
    
    await tx.task.updateMany({
      where: {
        columnId: body.columnId,
        position: { gte: body.position },
      },
      data: {
        position: { increment: 1 },
      },
    })
    
    await tx.task.update({
      where: { id: params.id },
      data: {
        columnId: body.columnId,
        position: body.position,
      },
    })
  })
  
  const updatedTask = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      epic: true,
      labels: { include: { label: true } },
    },
  })
  
  return NextResponse.json(updatedTask)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tasks/ src/app/api/boards/[id]/tasks/
git commit -m "feat: add task API routes with move support"
```

---

### Task 6: Epic & Label API Routes

**Covers:** [S4]

**Files:**
- Create: `src/app/api/boards/[id]/epics/route.ts`, `src/app/api/epics/[id]/route.ts`, `src/app/api/boards/[id]/labels/route.ts`

- [ ] **Step 1: Create epics endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateEpicInput } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const epics = await prisma.epic.findMany({
    where: { boardId: params.id },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: 'desc' },
  })
  
  return NextResponse.json(epics)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body: CreateEpicInput = await request.json()
  
  const epic = await prisma.epic.create({
    data: {
      boardId: params.id,
      title: body.title,
      description: body.description,
      color: body.color || '#3B82F6',
    },
  })
  
  return NextResponse.json(epic, { status: 201 })
}
```

- [ ] **Step 2: Create single epic endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  
  const epic = await prisma.epic.update({
    where: { id: params.id },
    data: {
      title: body.title,
      description: body.description,
      color: body.color,
    },
  })
  
  return NextResponse.json(epic)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  await prisma.epic.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create labels endpoint**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateLabelInput } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const labels = await prisma.label.findMany({
    where: { boardId: params.id },
    orderBy: { name: 'asc' },
  })
  
  return NextResponse.json(labels)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body: CreateLabelInput = await request.json()
  
  const label = await prisma.label.create({
    data: {
      boardId: params.id,
      name: body.name,
      color: body.color || '#6B7280',
    },
  })
  
  return NextResponse.json(label, { status: 201 })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/boards/[id]/epics/ src/app/api/epics/ src/app/api/boards/[id]/labels/
git commit -m "feat: add epic and label API routes"
```

---

### Task 7: useBoard Hook

**Covers:** [S7]

**Files:**
- Create: `src/hooks/useBoard.ts`

- [ ] **Step 1: Create board data fetching hook**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { BoardWithDetails, TaskWithDetails, CreateTaskInput, MoveTaskInput, TaskFilters } from '@/lib/types'

export function useBoard(boardId: string | null) {
  const [board, setBoard] = useState<BoardWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const fetchBoard = useCallback(async () => {
    if (!boardId) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/boards/${boardId}`)
      if (!response.ok) throw new Error('Failed to fetch board')
      const data = await response.json()
      setBoard(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [boardId])
  
  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])
  
  const createTask = async (taskData: CreateTaskInput) => {
    const response = await fetch(`/api/boards/${boardId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    })
    
    if (!response.ok) throw new Error('Failed to create task')
    
    const newTask = await response.json()
    await fetchBoard()
    return newTask
  }
  
  const updateTask = async (taskId: string, taskData: Partial<CreateTaskInput>) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    })
    
    if (!response.ok) throw new Error('Failed to update task')
    
    await fetchBoard()
  }
  
  const deleteTask = async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) throw new Error('Failed to delete task')
    
    await fetchBoard()
  }
  
  const moveTask = async (taskId: string, moveData: MoveTaskInput) => {
    const response = await fetch(`/api/tasks/${taskId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(moveData),
    })
    
    if (!response.ok) throw new Error('Failed to move task')
    
    await fetchBoard()
  }
  
  return {
    board,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    refresh: fetchBoard,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBoard.ts
git commit -m "feat: add useBoard hook for data management"
```

---

### Task 8: Sidebar Component

**Covers:** [S5]

**Files:**
- Create: `src/components/Sidebar.tsx`, `src/components/CreateBoardModal.tsx`

- [ ] **Step 1: Create Sidebar component**

```tsx
'use client'

import { useState } from 'react'
import { LayoutDashboard, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { CreateBoardModal } from './CreateBoardModal'

type Board = {
  id: string
  name: string
  _count: { tasks: number }
}

type SidebarProps = {
  boards: Board[]
  selectedBoardId: string | null
  onSelectBoard: (id: string) => void
  onBoardCreated: () => void
}

export function Sidebar({ boards, selectedBoardId, onSelectBoard, onBoardCreated }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  return (
    <>
      <aside
        className={`bg-gray-900 text-white transition-all duration-300 flex flex-col ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {!collapsed && <h1 className="font-bold text-lg">Kanban Board</h1>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 hover:bg-gray-700 rounded"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {!collapsed && (
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs text-gray-400 uppercase">Доски</span>
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <Plus size={16} />
              </button>
            </div>
          )}
          
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded mb-1 text-left transition-colors ${
                selectedBoardId === board.id
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-700'
              }`}
            >
              <LayoutDashboard size={18} />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="truncate">{board.name}</div>
                  <div className="text-xs text-gray-400">{board._count.tasks} задач</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </aside>
      
      {showCreateModal && (
        <CreateBoardModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            onBoardCreated()
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Create CreateBoardModal component**

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

type CreateBoardModalProps = {
  onClose: () => void
  onCreated: () => void
}

export function CreateBoardModal({ onClose, onCreated }: CreateBoardModalProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    
    setLoading(true)
    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      
      if (response.ok) {
        onCreated()
      }
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Новая доска</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название доски"
            className="w-full px-3 py-2 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx src/components/CreateBoardModal.tsx
git commit -m "feat: add Sidebar and CreateBoardModal components"
```

---

### Task 9: TaskCard Component

**Covers:** [S5]

**Files:**
- Create: `src/components/TaskCard.tsx`, `src/components/LabelBadge.tsx`

- [ ] **Step 1: Create LabelBadge component**

```tsx
type LabelBadgeProps = {
  name: string
  color: string
}

export function LabelBadge({ name, color }: LabelBadgeProps) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-xs text-white rounded-full truncate max-w-[120px]"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  )
}
```

- [ ] **Step 2: Create TaskCard component**

```tsx
'use client'

import { Draggable } from '@hello-pangea/dnd'
import { Clock, User } from 'lucide-react'
import { TaskWithDetails } from '@/lib/types'
import { LabelBadge } from './LabelBadge'
import { getPriorityColor, formatTaskId } from '@/lib/utils'

type TaskCardProps = {
  task: TaskWithDetails
  index: number
  onClick: () => void
}

export function TaskCard({ task, index, onClick }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-white border rounded-lg p-3 mb-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500 font-mono">
              {formatTaskId(task.taskNumber)}
            </span>
            <span className={`text-sm ${getPriorityColor(task.priority)}`}>
              {task.priority === 'CRITICAL' && '🔴'}
              {task.priority === 'HIGH' && '🟠'}
              {task.priority === 'MEDIUM' && '🟡'}
              {task.priority === 'LOW' && '🟢'}
            </span>
          </div>
          
          <h3 className="font-medium text-sm mb-2 line-clamp-2">{task.title}</h3>
          
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {task.labels.map((tl) => (
                <LabelBadge
                  key={tl.labelId}
                  name={tl.label.name}
                  color={tl.label.color}
                />
              ))}
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              {task.assignee ? (
                <>
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
                    {task.assignee[0]}
                  </div>
                  <span className="truncate max-w-[80px]">{task.assignee}</span>
                </>
              ) : (
                <span className="text-gray-400">Не назначен</span>
              )}
            </div>
            
            {task.estimatedTime && (
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{task.estimatedTime}</span>
              </div>
            )}
          </div>
          
          {task.epic && (
            <div className="mt-2 pt-2 border-t">
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: task.epic.color + '20', color: task.epic.color }}
              >
                {task.epic.title}
              </span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskCard.tsx src/components/LabelBadge.tsx
git commit -m "feat: add TaskCard and LabelBadge components"
```

---

### Task 10: KanbanColumn Component

**Covers:** [S5]

**Files:**
- Create: `src/components/KanbanColumn.tsx`

- [ ] **Step 1: Create KanbanColumn component**

```tsx
'use client'

import { Droppable } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { Column, TaskWithDetails } from '@/lib/types'
import { TaskCard } from './TaskCard'

type KanbanColumnProps = {
  column: Column
  tasks: TaskWithDetails[]
  onTaskClick: (task: TaskWithDetails) => void
  onAddTask: () => void
}

export function KanbanColumn({ column, tasks, onTaskClick, onAddTask }: KanbanColumnProps) {
  const taskCount = tasks.length
  const isOverLimit = column.wipLimit && taskCount > column.wipLimit
  
  return (
    <div className="flex-shrink-0 w-72 bg-gray-100 rounded-lg flex flex-col max-h-[calc(100vh-140px)]">
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: column.color }}
            />
            <h3 className="font-semibold text-sm uppercase">{column.title}</h3>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isOverLimit ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
              {taskCount}
              {column.wipLimit && ` / ${column.wipLimit}`}
            </span>
            <button
              onClick={onAddTask}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
      
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto p-2 min-h-[100px] transition-colors ${
              snapshot.isDraggingOver ? 'bg-blue-50' : ''
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/KanbanColumn.tsx
git commit -m "feat: add KanbanColumn component"
```

---

### Task 11: TaskModal Component

**Covers:** [S5]

**Files:**
- Create: `src/components/TaskModal.tsx`

- [ ] **Step 1: Create TaskModal component**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { TaskWithDetails, CreateTaskInput, Epic, Label, Column } from '@/lib/types'

type TaskModalProps = {
  task?: TaskWithDetails | null
  columnId: string
  columns: Column[]
  epics: Epic[]
  labels: Label[]
  onClose: () => void
  onSave: (data: CreateTaskInput) => Promise<void>
  onDelete?: () => Promise<void>
}

export function TaskModal({
  task,
  columnId,
  columns,
  epics,
  labels,
  onClose,
  onSave,
  onDelete,
}: TaskModalProps) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [selectedColumnId, setSelectedColumnId] = useState(task?.columnId || columnId)
  const [epicId, setEpicId] = useState(task?.epicId || '')
  const [priority, setPriority] = useState(task?.priority || 'MEDIUM')
  const [assignee, setAssignee] = useState(task?.assignee || '')
  const [estimatedTime, setEstimatedTime] = useState(task?.estimatedTime || '')
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>(
    task?.labels.map((tl) => tl.labelId) || []
  )
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    
    setLoading(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        columnId: selectedColumnId,
        epicId: epicId || undefined,
        priority,
        assignee: assignee.trim() || undefined,
        estimatedTime: estimatedTime.trim() || undefined,
        labelIds: selectedLabelIds,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }
  
  const handleDelete = async () => {
    if (!onDelete) return
    if (!confirm('Удалить задачу?')) return
    
    setLoading(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setLoading(false)
    }
  }
  
  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    )
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">
            {task ? 'Редактировать задачу' : 'Новая задача'}
          </h2>
          <div className="flex items-center gap-2">
            {task && onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
              <X size={18} />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Заголовок *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Столбец</label>
              <select
                value={selectedColumnId}
                onChange={(e) => setSelectedColumnId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Приоритет</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="LOW">🟢 Низкий</option>
                <option value="MEDIUM">🟡 Средний</option>
                <option value="HIGH">🟠 Высокий</option>
                <option value="CRITICAL">🔴 Критический</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Исполнитель</label>
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Имя исполнителя"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Время</label>
              <input
                type="text"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                placeholder="2 days"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Эпик</label>
            <select
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Без эпика</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Метки</label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleLabel(label.id)}
                  className={`px-3 py-1 rounded-full text-sm text-white transition-opacity ${
                    selectedLabelIds.includes(label.id) ? 'opacity-100' : 'opacity-40'
                  }`}
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TaskModal.tsx
git commit -m "feat: add TaskModal component"
```

---

### Task 12: EpicModal Component

**Covers:** [S5]

**Files:**
- Create: `src/components/EpicModal.tsx`

- [ ] **Step 1: Create EpicModal component**

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Epic } from '@/lib/types'

type EpicModalProps = {
  epic?: Epic | null
  onClose: () => void
  onSave: (data: { title: string; description?: string; color: string }) => Promise<void>
}

const COLORS = [
  '#3B82F6', '#EF4444', '#22C55E', '#EAB308',
  '#8B5CF6', '#EC4899', '#F97316', '#06B6D4',
]

export function EpicModal({ epic, onClose, onSave }: EpicModalProps) {
  const [title, setTitle] = useState(epic?.title || '')
  const [description, setDescription] = useState(epic?.description || '')
  const [color, setColor] = useState(epic?.color || COLORS[0])
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    
    setLoading(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        color,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">
            {epic ? 'Редактировать эпик' : 'Новый эпик'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Название *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Цвет</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    color === c ? 'border-gray-800 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/EpicModal.tsx
git commit -m "feat: add EpicModal component"
```

---

### Task 13: Filters Component

**Covers:** [S5]

**Files:**
- Create: `src/components/Filters.tsx`

- [ ] **Step 1: Create Filters component**

```tsx
'use client'

import { Filter, X } from 'lucide-react'
import { Epic } from '@/lib/types'

type FiltersProps = {
  epics: Epic[]
  assignees: string[]
  filters: {
    epicId?: string
    assignee?: string
    epicsOnly?: boolean
    noAssignee?: boolean
  }
  onFilterChange: (filters: FiltersProps['filters']) => void
}

export function Filters({ epics, assignees, filters, onFilterChange }: FiltersProps) {
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <Filter size={16} />
        <span>Фильтры:</span>
      </div>
      
      <button
        onClick={() =>
          onFilterChange({ ...filters, epicsOnly: !filters.epicsOnly })
        }
        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
          filters.epicsOnly
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Только эпики
      </button>
      
      <button
        onClick={() =>
          onFilterChange({ ...filters, noAssignee: !filters.noAssignee })
        }
        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
          filters.noAssignee
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Без исполнителя
      </button>
      
      <select
        value={filters.epicId || ''}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            epicId: e.target.value || undefined,
          })
        }
        className="px-3 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Все эпики</option>
        {epics.map((epic) => (
          <option key={epic.id} value={epic.id}>
            {epic.title}
          </option>
        ))}
      </select>
      
      <select
        value={filters.assignee || ''}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            assignee: e.target.value || undefined,
          })
        }
        className="px-3 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Все исполнители</option>
        {assignees.map((assignee) => (
          <option key={assignee} value={assignee}>
            {assignee}
          </option>
        ))}
      </select>
      
      {activeFilterCount > 0 && (
        <button
          onClick={() => onFilterChange({})}
          className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <X size={14} />
          Сбросить ({activeFilterCount})
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Filters.tsx
git commit -m "feat: add Filters component"
```

---

### Task 14: BoardView Component

**Covers:** [S5, S7]

**Files:**
- Create: `src/components/BoardView.tsx`

- [ ] **Step 1: Create BoardView component**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { BoardWithDetails, TaskWithDetails, CreateTaskInput, Epic, Label, TaskFilters } from '@/lib/types'
import { KanbanColumn } from './KanbanColumn'
import { TaskModal } from './TaskModal'
import { EpicModal } from './EpicModal'
import { Filters } from './Filters'

type BoardViewProps = {
  board: BoardWithDetails
  onMoveTask: (taskId: string, columnId: string, position: number) => Promise<void>
  onCreateTask: (data: CreateTaskInput) => Promise<void>
  onUpdateTask: (taskId: string, data: Partial<CreateTaskInput>) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  onCreateEpic: (data: { title: string; description?: string; color: string }) => Promise<void>
  onCreateLabel: (data: { name: string; color: string }) => Promise<void>
  onRefresh: () => void
}

export function BoardView({
  board,
  onMoveTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCreateEpic,
  onCreateLabel,
  onRefresh,
}: BoardViewProps) {
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showEpicModal, setShowEpicModal] = useState(false)
  const [taskColumnId, setTaskColumnId] = useState('')
  const [filters, setFilters] = useState<TaskFilters>({})
  
  const assignees = useMemo(() => {
    const allAssignees = board.columns.flatMap((col) =>
      col.tasks
        .map((t) => t.assignee)
        .filter((a): a is string => a !== null && a !== undefined)
    )
    return [...new Set(allAssignees)]
  }, [board])
  
  const filteredTasks = useMemo(() => {
    const tasksByColumn: Record<string, TaskWithDetails[]> = {}
    
    board.columns.forEach((col) => {
      tasksByColumn[col.id] = col.tasks.filter((task) => {
        if (filters.epicId && task.epicId !== filters.epicId) return false
        if (filters.assignee && task.assignee !== filters.assignee) return false
        if (filters.epicsOnly && !task.epic) return false
        if (filters.noAssignee && task.assignee) return false
        return true
      })
    })
    
    return tasksByColumn
  }, [board, filters])
  
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    
    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }
    
    await onMoveTask(draggableId, destination.droppableId, destination.index)
  }
  
  const handleAddTask = (columnId: string) => {
    setTaskColumnId(columnId)
    setSelectedTask(null)
    setShowTaskModal(true)
  }
  
  const handleTaskClick = (task: TaskWithDetails) => {
    setSelectedTask(task)
    setTaskColumnId(task.columnId)
    setShowTaskModal(true)
  }
  
  const handleSaveTask = async (data: CreateTaskInput) => {
    if (selectedTask) {
      await onUpdateTask(selectedTask.id, data)
    } else {
      await onCreateTask({ ...data, columnId: taskColumnId })
    }
  }
  
  const handleDeleteTask = async () => {
    if (selectedTask) {
      await onDeleteTask(selectedTask.id)
    }
  }
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{board.name}</h1>
            <p className="text-sm text-gray-500">
              {board.columns.reduce((acc, col) => acc + col.tasks.length, 0)} задач
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEpicModal(true)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              + Эпик
            </button>
            <button
              onClick={() => handleAddTask(board.columns[0]?.id)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Задача
            </button>
          </div>
        </div>
        
        <Filters
          epics={board.epics}
          assignees={assignees}
          filters={filters}
          onFilterChange={setFilters}
        />
      </div>
      
      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={filteredTasks[column.id] || []}
                onTaskClick={handleTaskClick}
                onAddTask={() => handleAddTask(column.id)}
              />
            ))}
          </div>
        </DragDropContext>
      </div>
      
      {showTaskModal && (
        <TaskModal
          task={selectedTask}
          columnId={taskColumnId}
          columns={board.columns}
          epics={board.epics}
          labels={board.labels}
          onClose={() => {
            setShowTaskModal(false)
            setSelectedTask(null)
          }}
          onSave={handleSaveTask}
          onDelete={selectedTask ? handleDeleteTask : undefined}
        />
      )}
      
      {showEpicModal && (
        <EpicModal
          onClose={() => setShowEpicModal(false)}
          onSave={async (data) => {
            await onCreateEpic(data)
            setShowEpicModal(false)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BoardView.tsx
git commit -m "feat: add BoardView component with drag-and-drop"
```

---

### Task 15: Main Page

**Covers:** [S5]

**Files:**
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create main page**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { BoardView } from '@/components/BoardView'
import { CreateBoardModal } from '@/components/CreateBoardModal'
import { useBoard } from '@/hooks/useBoard'
import { CreateTaskInput } from '@/lib/types'

type Board = {
  id: string
  name: string
  _count: { tasks: number }
}

export default function Home() {
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [loadingBoards, setLoadingBoards] = useState(true)
  
  const { board, loading: loadingBoard, createTask, updateTask, deleteTask, moveTask, refresh } =
    useBoard(selectedBoardId)
  
  const fetchBoards = async () => {
    try {
      const response = await fetch('/api/boards')
      const data = await response.json()
      setBoards(data)
    } finally {
      setLoadingBoards(false)
    }
  }
  
  useEffect(() => {
    fetchBoards()
  }, [])
  
  const handleCreateEpic = async (data: { title: string; description?: string; color: string }) => {
    if (!selectedBoardId) return
    
    await fetch(`/api/boards/${selectedBoardId}/epics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    
    refresh()
  }
  
  const handleCreateLabel = async (data: { name: string; color: string }) => {
    if (!selectedBoardId) return
    
    await fetch(`/api/boards/${selectedBoardId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    
    refresh()
  }
  
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        boards={boards}
        selectedBoardId={selectedBoardId}
        onSelectBoard={setSelectedBoardId}
        onBoardCreated={fetchBoards}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {loadingBoards ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Загрузка...</div>
          </div>
        ) : boards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl text-gray-600">Нет досок</h2>
            <p className="text-gray-400">Создайте первую доску для начала работы</p>
          </div>
        ) : !selectedBoardId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl text-gray-600">Выберите доску</h2>
            <p className="text-gray-400">или создайте новую в боковой панели</p>
          </div>
        ) : loadingBoard ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Загрузка доски...</div>
          </div>
        ) : board ? (
          <BoardView
            board={board}
            onMoveTask={moveTask}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onCreateEpic={handleCreateEpic}
            onCreateLabel={handleCreateLabel}
            onRefresh={refresh}
          />
        ) : null}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update layout.tsx**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Kanban Board',
  description: 'Task tracker similar to Jira',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: add main page with board management"
```

---

### Task 16: Final Testing & Polish

**Covers:** [S8]

**Files:**
- Modify: `src/app/globals.css`, `tailwind.config.ts`

- [ ] **Step 1: Update globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }
}

@layer utilities {
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}
```

- [ ] **Step 2: Run development server**

```bash
npm run dev
```

- [ ] **Step 3: Test all features**

- Create a new board
- Add tasks to columns
- Drag and drop tasks between columns
- Create epics and assign tasks
- Test filters
- Test responsive design

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: kanban board complete with responsive design"
```
