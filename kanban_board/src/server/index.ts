import { serve } from '@hono/node-server'
import { seedUsers } from './db/seed.js'
import { createApp } from './app.js'

if (process.env.NODE_ENV === 'development') {
  await seedUsers()
}

const app = createApp()

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
