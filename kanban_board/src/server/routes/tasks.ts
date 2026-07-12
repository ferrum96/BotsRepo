import { Hono } from 'hono'
import { db } from '../db/index.js'
import { tasks, taskLabels } from '../db/schema.js'
import { eq, desc, asc } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const app = new Hono()

app.post('/:boardId/tasks', async (c) => {
  const { boardId } = c.req.param()
  const body = await c.req.json()

  const lastTask = await db.query.tasks.findFirst({
    orderBy: [desc(tasks.taskNumber)],
  })

  const maxPosition = await db.query.tasks.findFirst({
    where: eq(tasks.columnId, body.columnId),
    orderBy: [desc(tasks.position)],
  })

  const id = randomUUID()
  const now = new Date()

  const [task] = await db.insert(tasks).values({
    id,
    taskNumber: (lastTask?.taskNumber ?? 0) + 1,
    boardId,
    columnId: body.columnId,
    epicId: body.epicId || null,
    title: body.title,
    description: body.description || null,
    priority: body.priority || 'MEDIUM',
    assignee: body.assignee || null,
    estimatedTime: body.estimatedTime || null,
    meta: body.meta || '{}',
    position: (maxPosition?.position ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  }).returning()

  if (body.labelIds?.length) {
    await db.insert(taskLabels).values(
      body.labelIds.map((labelId: string) => ({ taskId: id, labelId }))
    )
  }

  return c.json(task, 201)
})

app.put('/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  const { labelIds, ...data } = body

  await db.update(tasks).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(tasks.id, id))

  if (labelIds) {
    await db.delete(taskLabels).where(eq(taskLabels.taskId, id))
    if (labelIds.length) {
      await db.insert(taskLabels).values(
        labelIds.map((labelId: string) => ({ taskId: id, labelId }))
      )
    }
  }

  return c.json({ success: true })
})

app.delete('/tasks/:id', async (c) => {
  const { id } = c.req.param()
  await db.delete(tasks).where(eq(tasks.id, id))
  return c.json({ success: true })
})

app.patch('/tasks/:id/move', async (c) => {
  const { id } = c.req.param()
  const { columnId, position } = await c.req.json() as { columnId: string; position: number }

  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!task) return c.json({ error: 'Not found' }, 404)

  const sourceColumnId = task.columnId

  db.transaction((tx) => {
    const targetTasks = tx
      .select()
      .from(tasks)
      .where(eq(tasks.columnId, columnId))
      .orderBy(asc(tasks.position))
      .all()
    const others = targetTasks.filter((t) => t.id !== id)
    const insertIndex = Math.max(0, Math.min(position, others.length))

    const reordered = [
      ...others.slice(0, insertIndex),
      { ...task, columnId },
      ...others.slice(insertIndex),
    ]

    for (const [idx, reorderedTask] of reordered.entries()) {
      tx.update(tasks)
        .set({
          columnId: reorderedTask.columnId,
          position: idx,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, reorderedTask.id))
        .run()
    }

    if (sourceColumnId !== columnId) {
      const sourceTasks = tx
        .select()
        .from(tasks)
        .where(eq(tasks.columnId, sourceColumnId))
        .orderBy(asc(tasks.position))
        .all()
      const sourceOthers = sourceTasks.filter((t) => t.id !== id)
      for (const [idx, sourceTask] of sourceOthers.entries()) {
        tx.update(tasks)
          .set({ position: idx, updatedAt: new Date() })
          .where(eq(tasks.id, sourceTask.id))
          .run()
      }
    }
  })

  return c.json({ success: true })
})

export default app
