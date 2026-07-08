import { Hono } from 'hono'
import { db } from '../db/index.js'
import { epics } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const app = new Hono()

app.post('/:boardId/epics', async (c) => {
  const { boardId } = c.req.param()
  const body = await c.req.json()

  const [epic] = await db.insert(epics).values({
    id: randomUUID(),
    boardId,
    title: body.title,
    description: body.description || null,
    color: body.color || '#3B82F6',
    createdAt: new Date(),
  }).returning()

  return c.json(epic, 201)
})

app.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  await db.update(epics).set(body).where(eq(epics.id, id))
  return c.json({ success: true })
})

app.delete('/:id', async (c) => {
  const { id } = c.req.param()
  await db.delete(epics).where(eq(epics.id, id))
  return c.json({ success: true })
})

export default app
