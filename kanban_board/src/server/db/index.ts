import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

const sqlite = new Database(process.env.DB_PATH || './data/kanban.db')

try {
  sqlite.exec(`ALTER TABLE tasks ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'`)
} catch {
  // Column already exists in existing databases.
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    username text NOT NULL,
    passwordHash text NOT NULL,
    displayName text NOT NULL,
    avatar text,
    createdAt integer NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
`)

try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`)
} catch {
  // Column already exists in existing databases.
}

export const db = drizzle(sqlite, { schema })
