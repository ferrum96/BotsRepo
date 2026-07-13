import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { createToken } from '../../src/server/auth.js'
import { initializeTestDatabase, resetDatabase } from '../helpers/test-db.js'

type BoardDetails = {
  id: string
  columns: Array<{
    id: string
    title: string
    tasks: Array<{
      id: string
      title: string
      description: string | null
      priority: string
      assignee: string | null
      estimatedTime: string | null
      columnId: string
      epicId: string | null
      epic: { id: string; title: string; color: string } | null
    }>
  }>
  epics: Array<{ id: string; title: string }>
}

describe('API integration: task title and epic', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  beforeEach(() => {
    resetDatabase()
  })

  async function createAuthedBoard() {
    const token = await createToken({
      id: 'u-task-details',
      username: 'task-details',
      displayName: 'Task Details User',
      avatar: null,
    })
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const boardResponse = await app.request('/api/boards', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Task Details Board' }),
    })
    expect(boardResponse.status).toBe(201)
    const board = await boardResponse.json() as { id: string }

    const detailsResponse = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(detailsResponse.status).toBe(200)
    const details = await detailsResponse.json() as BoardDetails
    const column = details.columns[0]
    expect(column).toBeDefined()

    return { authHeaders, boardId: board.id, columnId: column.id }
  }

  async function fetchBoard(boardId: string, authHeaders: { Authorization: string }) {
    const response = await app.request(`/api/boards/${boardId}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    expect(response.status).toBe(200)
    return response.json() as Promise<BoardDetails>
  }

  function findTask(board: BoardDetails, taskId: string) {
    const task = board.columns.flatMap((column) => column.tasks).find((item) => item.id === taskId)
    expect(task).toBeDefined()
    return task!
  }

  it('updates task title', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Initial title',
        priority: 'MEDIUM',
      }),
    })
    expect(createTaskResponse.status).toBe(201)
    const task = await createTaskResponse.json() as { id: string }

    const updateResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Updated title' }),
    })
    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toEqual({ success: true })

    const board = await fetchBoard(boardId, authHeaders)
    expect(findTask(board, task.id).title).toBe('Updated title')
  })

  it('creates epic and attaches it to a task', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()

    const epicResponse = await app.request(`/api/${boardId}/epics`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Auth Epic',
        color: '#3B82F6',
      }),
    })
    expect(epicResponse.status).toBe(201)
    const epic = await epicResponse.json() as { id: string; title: string }

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Task without epic',
        priority: 'LOW',
      }),
    })
    expect(createTaskResponse.status).toBe(201)
    const task = await createTaskResponse.json() as { id: string; epicId: string | null }
    expect(task.epicId).toBeNull()

    const attachResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ epicId: epic.id }),
    })
    expect(attachResponse.status).toBe(200)

    const board = await fetchBoard(boardId, authHeaders)
    const attached = findTask(board, task.id)
    expect(attached.epicId).toBe(epic.id)
    expect(attached.epic).toEqual(expect.objectContaining({
      id: epic.id,
      title: 'Auth Epic',
    }))
  })

  it('clears epic from a task', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()

    const epicResponse = await app.request(`/api/${boardId}/epics`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Temporary Epic' }),
    })
    const epic = await epicResponse.json() as { id: string }

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Task with epic',
        epicId: epic.id,
        priority: 'HIGH',
      }),
    })
    const task = await createTaskResponse.json() as { id: string; epicId: string | null }
    expect(task.epicId).toBe(epic.id)

    const clearResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ epicId: null }),
    })
    expect(clearResponse.status).toBe(200)

    const board = await fetchBoard(boardId, authHeaders)
    const cleared = findTask(board, task.id)
    expect(cleared.epicId).toBeNull()
    expect(cleared.epic).toBeNull()
  })

  it('updates title and epic together', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()

    const epicResponse = await app.request(`/api/${boardId}/epics`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Combined Epic' }),
    })
    const epic = await epicResponse.json() as { id: string }

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Old title',
        priority: 'MEDIUM',
      }),
    })
    const task = await createTaskResponse.json() as { id: string }

    const updateResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'New title with epic',
        epicId: epic.id,
      }),
    })
    expect(updateResponse.status).toBe(200)

    const board = await fetchBoard(boardId, authHeaders)
    const updated = findTask(board, task.id)
    expect(updated.title).toBe('New title with epic')
    expect(updated.epicId).toBe(epic.id)
    expect(updated.epic?.title).toBe('Combined Epic')
  })

  it('updates description and keeps it after detail field changes', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Visual fix',
        description: 'Initial description',
        priority: 'MEDIUM',
      }),
    })
    const task = await createTaskResponse.json() as { id: string }

    const descriptionResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        description: 'Unsaved editor draft already persisted',
      }),
    })
    expect(descriptionResponse.status).toBe(200)

    const priorityResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ priority: 'HIGH' }),
    })
    expect(priorityResponse.status).toBe(200)

    const assigneeResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ assignee: 'Салов Константин' }),
    })
    expect(assigneeResponse.status).toBe(200)

    const board = await fetchBoard(boardId, authHeaders)
    const updated = findTask(board, task.id)
    expect(updated.description).toBe('Unsaved editor draft already persisted')
    expect(updated.priority).toBe('HIGH')
    expect(updated.assignee).toBe('Салов Константин')
  })

  it('updates status without clearing description', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()
    const details = await fetchBoard(boardId, authHeaders)
    const targetColumn = details.columns[1]
    expect(targetColumn).toBeDefined()

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Status task',
        description: 'Keep this text',
        priority: 'LOW',
      }),
    })
    const task = await createTaskResponse.json() as { id: string }

    const statusResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ columnId: targetColumn.id }),
    })
    expect(statusResponse.status).toBe(200)

    const board = await fetchBoard(boardId, authHeaders)
    const updated = findTask(board, task.id)
    expect(updated.columnId).toBe(targetColumn.id)
    expect(updated.description).toBe('Keep this text')
  })

  it('updates estimated time independently from title', async () => {
    const { authHeaders, boardId, columnId } = await createAuthedBoard()

    const createTaskResponse = await app.request(`/api/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Estimate task',
        priority: 'MEDIUM',
      }),
    })
    const task = await createTaskResponse.json() as { id: string }

    const estimateResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ estimatedTime: '1h 30m' }),
    })
    expect(estimateResponse.status).toBe(200)

    const titleResponse = await app.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Estimate task renamed' }),
    })
    expect(titleResponse.status).toBe(200)

    const board = await fetchBoard(boardId, authHeaders)
    const updated = findTask(board, task.id)
    expect(updated.title).toBe('Estimate task renamed')
    expect(updated.estimatedTime).toBe('1h 30m')
  })
})
