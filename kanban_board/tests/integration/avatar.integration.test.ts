import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { createTestUser, initializeTestDatabase, resetDatabase } from '../helpers/test-db.js'

describe('API integration: avatar', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  beforeEach(() => {
    resetDatabase()
  })

  async function login(username: string, password: string) {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    expect(response.status).toBe(200)
    const payload = await response.json() as { token: string; user: { id: string; avatar: string | null } }
    return {
      token: payload.token,
      user: payload.user,
      authHeaders: {
        Authorization: `Bearer ${payload.token}`,
        'Content-Type': 'application/json',
      },
    }
  }

  it('sets and clears avatar for current user', async () => {
    await createTestUser({
      username: 'avatar-user',
      password: 'avatar-password',
      displayName: 'Avatar User',
    })
    const { authHeaders } = await login('avatar-user', 'avatar-password')
    const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg'

    const setResponse = await app.request('/api/auth/avatar', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ avatar }),
    })
    expect(setResponse.status).toBe(200)
    const setPayload = await setResponse.json() as { user: { avatar: string | null } }
    expect(setPayload.user.avatar).toBe(avatar)

    const meResponse = await app.request('/api/auth/me', {
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(meResponse.status).toBe(200)
    await expect(meResponse.json()).resolves.toEqual({
      user: expect.objectContaining({ avatar }),
    })

    const clearResponse = await app.request('/api/auth/avatar', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ avatar: null }),
    })
    expect(clearResponse.status).toBe(200)
    const clearPayload = await clearResponse.json() as { user: { avatar: string | null } }
    expect(clearPayload.user.avatar).toBeNull()
  })

  it('rejects invalid avatar payload', async () => {
    await createTestUser({
      username: 'avatar-bad',
      password: 'avatar-password',
      displayName: 'Avatar Bad',
    })
    const { authHeaders } = await login('avatar-bad', 'avatar-password')

    const missingField = await app.request('/api/auth/avatar', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({}),
    })
    expect(missingField.status).toBe(400)
    await expect(missingField.json()).resolves.toEqual({ error: 'Передайте поле avatar' })

    const notImage = await app.request('/api/auth/avatar', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ avatar: 'not-an-image' }),
    })
    expect(notImage.status).toBe(400)
    await expect(notImage.json()).resolves.toEqual({ error: 'Аватар должен быть изображением' })
  })
})
