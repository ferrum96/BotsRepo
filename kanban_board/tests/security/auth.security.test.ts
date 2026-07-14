import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { initializeTestDatabase, resetDatabase, createTestUser } from '../helpers/test-db.js'

describe('Auth security', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  beforeEach(() => {
    resetDatabase()
  })

  it('rejects malformed bearer tokens', async () => {
    const response = await app.request('/api/users', {
      headers: { Authorization: 'Bearer not-a-valid-jwt' },
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects board creation without Authorization', async () => {
    const response = await app.request('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Board' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects board creation with malformed bearer token', async () => {
    const response = await app.request('/api/boards', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer not-a-valid-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Unauthorized Board' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('does not authenticate SQL injection payloads', async () => {
    await createTestUser({ username: 'secure-user', password: 'safe-password' })

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: "' OR 1=1 --",
        password: 'whatever',
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Неверный логин или пароль' })
  })

  it('returns generic auth error for invalid password', async () => {
    await createTestUser({ username: 'ivan', password: 'correct-password' })

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ivan',
        password: 'wrong-password',
      }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Неверный логин или пароль' })
  })

  it('rejects avatar update without Authorization', async () => {
    const response = await app.request('/api/auth/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: 'data:image/png;base64,abc' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects avatar update with malformed bearer token', async () => {
    const response = await app.request('/api/auth/avatar', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer not-a-valid-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar: 'data:image/png;base64,abc' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
