import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

const sqlite = new Database(process.env.DB_PATH || './data/kanban.db')

try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'`)
} catch {
  // Column already exists in existing databases.
}

export const db = drizzle(sqlite, { schema })
