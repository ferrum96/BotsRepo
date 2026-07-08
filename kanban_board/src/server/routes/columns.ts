import { Hono } from 'hono'
import { db } from '../db/index.js'
import { columns } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const app = new Hono()

app.post('/:boardId/columns', async (c) => {
  const { boardId } = c.req.param()
  const body = await c.req.json()

  const maxPosition = await db.query.columns.findFirst({
    where: eq(columns.boardId, boardId),
    orderBy: (columns, { desc }) => [desc(columns.position)],
  })

  const [column] = await db.insert(columns).values({
    id: randomUUID(),
    boardId,
    title: body.title,
    position: (maxPosition?.position ?? -1) + 1,
    color: body.color || '#6B7280',
    wipLimit: body.wipLimit || null,
  }).returning()

  return c.json(column, 201)
})

app.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  await db.update(columns).set(body).where(eq(columns.id, id))
  return c.json({ success: true })
})

app.delete('/:id', async (c) => {
  const { id } = c.req.param()
  await db.delete(columns).where(eq(columns.id, id))
  return c.json({ success: true })
})

export default app
