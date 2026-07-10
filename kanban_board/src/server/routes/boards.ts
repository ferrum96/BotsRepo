import { Hono } from 'hono'
import { db } from '../db/index.js'
import { boards, columns, tasks } from '../db/schema.js'
import { eq, count, asc } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const app = new Hono()

app.get('/', async (c) => {
  const allBoards = await db
    .select({
      id: boards.id,
      name: boards.name,
      createdAt: boards.createdAt,
      updatedAt: boards.updatedAt,
      taskCount: count(tasks.id),
    })
    .from(boards)
    .leftJoin(tasks, eq(boards.id, tasks.boardId))
    .groupBy(boards.id)

  const result = allBoards.map((b) => ({
    ...b,
    _count: { tasks: b.taskCount },
  }))

  return c.json(result)
})

app.post('/', async (c) => {
  const body = await c.req.json()
  const id = randomUUID()
  const now = new Date()

  const [board] = await db.insert(boards).values({
    id,
    name: body.name,
    createdAt: now,
    updatedAt: now,
  }).returning()

  const defaultColumns = [
    { title: 'BACKLOG', color: '#6B7280' },
    { title: 'GROOMING', color: '#F59E0B' },
    { title: 'HOLD', color: '#EF4444' },
    { title: 'TO DO', color: '#3B82F6' },
    { title: 'IN PROGRESS', color: '#8B5CF6' },
    { title: 'IN REVIEW', color: '#EC4899' },
    { title: 'DONE', color: '#22C55E' },
  ]
  await db.insert(columns).values(
    defaultColumns.map((col, i) => ({
      id: randomUUID(),
      boardId: id,
      title: col.title,
      position: i,
      color: col.color,
    }))
  )

  return c.json(board, 201)
})

app.get('/:id', async (c) => {
  const { id } = c.req.param()

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, id),
    with: {
      columns: {
        orderBy: [asc(columns.position)],
        with: {
          tasks: {
            orderBy: [asc(tasks.position)],
            with: {
              epic: true,
              labels: {
                with: { label: true },
              },
            },
          },
        },
      },
      epics: true,
      labels: true,
    },
  })

  if (!board) return c.json({ error: 'Not found' }, 404)
  return c.json(board)
})

app.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  const [board] = await db
    .update(boards)
    .set({ name: body.name, updatedAt: new Date() })
    .where(eq(boards.id, id))
    .returning()

  if (!board) return c.json({ error: 'Not found' }, 404)
  return c.json(board)
})

app.delete('/:id', async (c) => {
  const { id } = c.req.param()
  await db.delete(boards).where(eq(boards.id, id))
  return c.json({ success: true })
})

export default app
