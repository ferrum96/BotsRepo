import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import boardsRouter from './routes/boards.js'
import tasksRouter from './routes/tasks.js'
import columnsRouter from './routes/columns.js'
import epicsRouter from './routes/epics.js'
import labelsRouter from './routes/labels.js'
import { existsSync } from 'fs'

const app = new Hono()

app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.route('/api/boards', boardsRouter)
app.route('/api', tasksRouter)
app.route('/api', columnsRouter)
app.route('/api', epicsRouter)
app.route('/api', labelsRouter)

if (existsSync('./dist/client')) {
  app.use('/*', serveStatic({ root: './dist/client' }))
}

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
