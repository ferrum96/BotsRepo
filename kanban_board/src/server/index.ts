import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import boardsRouter from './routes/boards.js'
import tasksRouter from './routes/tasks.js'
import columnsRouter from './routes/columns.js'
import epicsRouter from './routes/epics.js'
import labelsRouter from './routes/labels.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import { authMiddleware, type AppVariables } from './auth.js'
import { seedUsers } from './db/seed.js'
import { existsSync, readFileSync } from 'fs'

if (process.env.NODE_ENV === 'development') {
  await seedUsers()
}

const app = new Hono<{ Variables: AppVariables }>()

app.use('/api/*', cors())
app.use('/api/*', authMiddleware)

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.route('/api/auth', authRouter)
app.route('/api/users', usersRouter)
app.route('/api/boards', boardsRouter)
app.route('/api', tasksRouter)
app.route('/api', columnsRouter)
app.route('/api', epicsRouter)
app.route('/api', labelsRouter)

if (existsSync('./dist/client')) {
  const indexHtml = readFileSync('./dist/client/index.html', 'utf8')
  app.use('*', async (c, next) => {
    await next()
    if (c.res.status !== 404) return
    if (c.req.method !== 'GET') return
    if (c.req.path.startsWith('/api/')) return
    // Keep 404 for missing static assets (e.g. .js/.css/.png files).
    if (c.req.path.includes('.')) return
    c.res = c.html(indexHtml)
  })
  app.use('/*', serveStatic({ root: './dist/client' }))
}

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
