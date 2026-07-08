import { Hono } from 'hono'
import { db } from '../db/index.js'
import { labels } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const app = new Hono()

app.post('/:boardId/labels', async (c) => {
  const { boardId } = c.req.param()
  const body = await c.req.json()

  const [label] = await db.insert(labels).values({
    id: randomUUID(),
    boardId,
    name: body.name,
    color: body.color || '#6B7280',
  }).returning()

  return c.json(label, 201)
})

app.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  await db.update(labels).set(body).where(eq(labels.id, id))
  return c.json({ success: true })
})

app.delete('/:id', async (c) => {
  const { id } = c.req.param()
  await db.delete(labels).where(eq(labels.id, id))
  return c.json({ success: true })
})

export default app
