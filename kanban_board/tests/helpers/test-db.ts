import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { db } from '../../src/server/db/index.js'
import { users } from '../../src/server/db/schema.js'

const dbPath = process.env.DB_PATH

if (!dbPath) {
  throw new Error('DB_PATH must be defined for tests')
}

const sqlite = new Database(dbPath)
sqlite.pragma('foreign_keys = ON')

const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    username text NOT NULL,
    passwordHash text NOT NULL,
    displayName text NOT NULL,
    avatar text,
    createdAt integer NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    createdAt integer NOT NULL,
    updatedAt integer NOT NULL
  );

  CREATE TABLE IF NOT EXISTS columns (
    id text PRIMARY KEY NOT NULL,
    boardId text NOT NULL,
    title text NOT NULL,
    position integer NOT NULL,
    wipLimit integer,
    color text DEFAULT '#6B7280' NOT NULL,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE cascade
  );

  CREATE TABLE IF NOT EXISTS epics (
    id text PRIMARY KEY NOT NULL,
    boardId text NOT NULL,
    title text NOT NULL,
    description text,
    color text DEFAULT '#3B82F6' NOT NULL,
    createdAt integer NOT NULL,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE cascade
  );

  CREATE TABLE IF NOT EXISTS labels (
    id text PRIMARY KEY NOT NULL,
    boardId text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280' NOT NULL,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE cascade
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id text PRIMARY KEY NOT NULL,
    taskNumber integer NOT NULL UNIQUE,
    boardId text NOT NULL,
    columnId text NOT NULL,
    epicId text,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'MEDIUM' NOT NULL,
    assignee text,
    estimatedTime text,
    meta text NOT NULL DEFAULT '{}',
    position integer NOT NULL,
    createdAt integer NOT NULL,
    updatedAt integer NOT NULL,
    FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE cascade,
    FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE cascade,
    FOREIGN KEY (epicId) REFERENCES epics(id) ON DELETE set null
  );

  CREATE TABLE IF NOT EXISTS taskLabels (
    taskId text NOT NULL,
    labelId text NOT NULL,
    PRIMARY KEY (taskId, labelId),
    FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE cascade,
    FOREIGN KEY (labelId) REFERENCES labels(id) ON DELETE cascade
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
`

const CLEAR_TABLES_SQL = `
  DELETE FROM taskLabels;
  DELETE FROM tasks;
  DELETE FROM epics;
  DELETE FROM labels;
  DELETE FROM columns;
  DELETE FROM boards;
  DELETE FROM users;
`

export function initializeTestDatabase() {
  sqlite.exec(CREATE_SCHEMA_SQL)
}

export function resetDatabase() {
  sqlite.exec(CLEAR_TABLES_SQL)
}

export async function createTestUser(overrides?: Partial<{ username: string; password: string; displayName: string }>) {
  const username = overrides?.username ?? 'test-user'
  const password = overrides?.password ?? 'test-password'
  const displayName = overrides?.displayName ?? 'Test User'
  const passwordHash = await bcrypt.hash(password, 10)

  const id = randomUUID()
  db.insert(users).values({
    id,
    username,
    passwordHash,
    displayName,
    avatar: null,
    createdAt: new Date(),
  }).run()

  return { id, username, password, displayName }
}
