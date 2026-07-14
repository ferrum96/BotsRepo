import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { createToken, type AppVariables, type AuthUser } from '../auth.js'
import { parseAvatarUpdate } from '../lib/avatar.js'

function toAuthUser(user: {
  id: string
  username: string
  displayName: string
  avatar: string | null
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
  }
}

const authRouter = new Hono<{ Variables: AppVariables }>()

authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null) as { username?: string; password?: string } | null
  const username = body?.username?.trim()
  const password = body?.password

  if (!username || !password) {
    return c.json({ error: 'Укажите логин и пароль' }, 400)
  }

  const user = db.select().from(users).where(eq(users.username, username)).get()
  if (!user) {
    return c.json({ error: 'Неверный логин или пароль' }, 401)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Неверный логин или пароль' }, 401)
  }

  const authUser = toAuthUser(user)
  const token = await createToken(authUser)
  return c.json({ token, user: authUser })
})

authRouter.get('/me', (c) => {
  const session = c.get('user')
  const user = db.select().from(users).where(eq(users.id, session.id)).get()
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return c.json({ user: toAuthUser(user) })
})

authRouter.put('/avatar', async (c) => {
  const session = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = parseAvatarUpdate(body)

  if (parsed.ok === false) {
    return c.json({ error: parsed.error }, 400)
  }

  db.update(users)
    .set({ avatar: parsed.avatar })
    .where(eq(users.id, session.id))
    .run()

  const user = db.select().from(users).where(eq(users.id, session.id)).get()
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return c.json({ user: toAuthUser(user) })
})

export default authRouter
