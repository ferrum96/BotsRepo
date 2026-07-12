import type { Context, Next } from 'hono'
import { sign, verify } from 'hono/jwt'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  avatar: string | null
}

export type AppVariables = {
  user: AuthUser
}

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
])

export function getJwtSecret() {
  return process.env.JWT_SECRET || 'kanban-dev-secret-change-me'
}

export async function createToken(user: AuthUser) {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      iat: now,
      exp: now + 60 * 60 * 24 * 7,
    },
    getJwtSecret(),
    'HS256'
  )
}

export async function authMiddleware(c: Context<{ Variables: AppVariables }>, next: Next) {
  if (c.req.method === 'OPTIONS') {
    return next()
  }

  const path = new URL(c.req.url).pathname
  if (PUBLIC_API_PATHS.has(path)) {
    return next()
  }

  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = await verify(token, getJwtSecret(), 'HS256')
    const id = typeof payload.sub === 'string' ? payload.sub : null
    const username = typeof payload.username === 'string' ? payload.username : null
    const displayName = typeof payload.displayName === 'string' ? payload.displayName : null

    if (!id || !username || !displayName) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', { id, username, displayName, avatar: null })
    return next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
