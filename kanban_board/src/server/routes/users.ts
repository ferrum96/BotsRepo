import { Hono } from 'hono'
import { asc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import type { AppVariables } from '../auth.js'

const usersRouter = new Hono<{ Variables: AppVariables }>()

usersRouter.get('/', (c) => {
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
    })
    .from(users)
    .orderBy(asc(users.displayName))
    .all()

  return c.json(rows)
})

export default usersRouter
