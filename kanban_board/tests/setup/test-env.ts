import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempDir = mkdtempSync(join(tmpdir(), 'kanban-board-tests-'))

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret'
process.env.DB_PATH = join(tempDir, 'kanban.test.db')
