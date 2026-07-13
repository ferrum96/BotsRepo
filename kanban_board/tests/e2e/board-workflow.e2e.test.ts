import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { createTestUser, initializeTestDatabase, resetDatabase } from '../helpers/test-db.js'

describe('E2E: board workflow', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  beforeEach(() => {
    resetDatabase()
  })

  it('runs login -> board -> task -> move -> cleanup flow', async () => {
    const testUser = await createTestUser({
      username: 'workflow-user',
      password: 'workflow-password',
      displayName: 'Workflow User',
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.password,
      }),
    })
    expect(loginResponse.status).toBe(200)

    const loginPayload = await loginResponse.json() as { token: string }
    const authHeaders = {
      Authorization: `Bearer ${loginPayload.token}`,
      'Content-Type': 'application/json',
    }

    const boardResponse = await app.request('/api/boards', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'E2E Board' }),
    })
    expect(boardResponse.status).toBe(201)
    const board = await boardResponse.json() as { id: string }

    const boardDetailsResponse = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(boardDetailsResponse.status).toBe(200)

    const boardDetails = await boardDetailsResponse.json() as {
      columns: Array<{ id: string; title: string }>
    }
    const sourceColumn = boardDetails.columns[0]
    const targetColumn = boardDetails.columns[1]
    expect(sourceColumn).toBeDefined()
    expect(targetColumn).toBeDefined()

    const taskResponse = await app.request(`/api/${board.id}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId: sourceColumn.id,
        title: 'E2E task',
        description: 'Created by e2e test',
        priority: 'HIGH',
      }),
    })
    expect(taskResponse.status).toBe(201)
    const task = await taskResponse.json() as { id: string }

    const epicResponse = await app.request(`/api/${board.id}/epics`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'E2E Epic',
        color: '#22C55E',
      }),
    })
    expect(epicResponse.status).toBe(201)
    const epic = await epicResponse.json() as { id: string; title: string }

    const updateDetailsResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'E2E task updated',
        epicId: epic.id,
      }),
    })
    expect(updateDetailsResponse.status).toBe(200)

    const updatedBoardResponse = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(updatedBoardResponse.status).toBe(200)
    const updatedBoard = await updatedBoardResponse.json() as {
      columns: Array<{
        tasks: Array<{
          id: string
          title: string
          epicId: string | null
          epic: { id: string; title: string } | null
        }>
      }>
    }
    const updatedTask = updatedBoard.columns
      .flatMap((column) => column.tasks)
      .find((item) => item.id === task.id)
    expect(updatedTask).toEqual(expect.objectContaining({
      title: 'E2E task updated',
      epicId: epic.id,
      epic: expect.objectContaining({
        id: epic.id,
        title: 'E2E Epic',
      }),
    }))

    const clearEpicResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ epicId: null }),
    })
    expect(clearEpicResponse.status).toBe(200)

    const clearedBoardResponse = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    const clearedBoard = await clearedBoardResponse.json() as {
      columns: Array<{
        tasks: Array<{ id: string; epicId: string | null; epic: unknown }>
      }>
    }
    const clearedTask = clearedBoard.columns
      .flatMap((column) => column.tasks)
      .find((item) => item.id === task.id)
    expect(clearedTask?.epicId).toBeNull()
    expect(clearedTask?.epic).toBeNull()

    const moveResponse = await app.request(`/api/tasks/${task.id}/move`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        columnId: targetColumn.id,
        position: 0,
      }),
    })
    expect(moveResponse.status).toBe(200)
    await expect(moveResponse.json()).resolves.toEqual({ success: true })

    const deleteTaskResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'DELETE',
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(deleteTaskResponse.status).toBe(200)
    await expect(deleteTaskResponse.json()).resolves.toEqual({ success: true })

    const deleteBoardResponse = await app.request(`/api/boards/${board.id}`, {
      method: 'DELETE',
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(deleteBoardResponse.status).toBe(200)

    const deletedBoardResponse = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(deletedBoardResponse.status).toBe(404)
  })
})
