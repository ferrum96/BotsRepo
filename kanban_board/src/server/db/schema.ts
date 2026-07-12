import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  displayName: text('displayName').notNull(),
  avatar: text('avatar'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
})

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const boardsRelations = relations(boards, ({ many }) => ({
  columns: many(columns),
  tasks: many(tasks),
  epics: many(epics),
  labels: many(labels),
}))

export const columns = sqliteTable('columns', {
  id: text('id').primaryKey(),
  boardId: text('boardId').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  wipLimit: integer('wipLimit'),
  color: text('color').notNull().default('#6B7280'),
})

export const columnsRelations = relations(columns, ({ one, many }) => ({
  board: one(boards, { fields: [columns.boardId], references: [boards.id] }),
  tasks: many(tasks),
}))

export const epics = sqliteTable('epics', {
  id: text('id').primaryKey(),
  boardId: text('boardId').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  color: text('color').notNull().default('#3B82F6'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
})

export const epicsRelations = relations(epics, ({ one, many }) => ({
  board: one(boards, { fields: [epics.boardId], references: [boards.id] }),
  tasks: many(tasks),
}))

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  taskNumber: integer('taskNumber').notNull().unique(),
  boardId: text('boardId').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  columnId: text('columnId').notNull().references(() => columns.id, { onDelete: 'cascade' }),
  epicId: text('epicId').references(() => epics.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('MEDIUM'),
  assignee: text('assignee'),
  estimatedTime: text('estimatedTime'),
  meta: text('meta').notNull().default('{}'),
  position: integer('position').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  board: one(boards, { fields: [tasks.boardId], references: [boards.id] }),
  column: one(columns, { fields: [tasks.columnId], references: [columns.id] }),
  epic: one(epics, { fields: [tasks.epicId], references: [epics.id] }),
  labels: many(taskLabels),
}))

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  boardId: text('boardId').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6B7280'),
})

export const labelsRelations = relations(labels, ({ one }) => ({
  board: one(boards, { fields: [labels.boardId], references: [boards.id] }),
}))

export const taskLabels = sqliteTable('taskLabels', {
  taskId: text('taskId').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  labelId: text('labelId').notNull().references(() => labels.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey(t.taskId, t.labelId),
}))

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}))
