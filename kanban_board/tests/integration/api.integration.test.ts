import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { createToken } from '../../src/server/auth.js'
import { initializeTestDatabase, resetDatabase } from '../helpers/test-db.js'

describe('API integration', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  beforeEach(() => {
    resetDatabase()
  })

  it('protects private endpoints', async () => {
    const response = await app.request('/api/boards')
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects unauthenticated board creation', async () => {
    const response = await app.request('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Token Board' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('creates board with default columns and returns board details', async () => {
    const token = await createToken({
      id: 'u1',
      username: 'integration',
      displayName: 'Integration User',
      avatar: null,
    })

    const created = await app.request('/api/boards', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Integration Board' }),
    })

    expect(created.status).toBe(201)
    const board = await created.json() as { id: string; name: string }
    expect(board.name).toBe('Integration Board')

    const fetched = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(fetched.status).toBe(200)

    const payload = await fetched.json() as { columns: Array<{ title: string }> }
    expect(payload.columns).toHaveLength(7)
    expect(payload.columns.map((column) => column.title)).toEqual([
      'BACKLOG',
      'GROOMING',
      'HOLD',
      'TO DO',
      'IN PROGRESS',
      'IN REVIEW',
      'DONE',
    ])
  })
})
