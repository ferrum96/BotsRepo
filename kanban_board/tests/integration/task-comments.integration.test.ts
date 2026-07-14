import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { createToken } from '../../src/server/auth.js'
import {
  addTaskComment,
  deleteTaskComment,
  updateTaskComment,
} from '../../src/client/lib/task-comments.js'
import { initializeTestDatabase, resetDatabase } from '../helpers/test-db.js'

type BoardDetails = {
  id: string
  columns: Array<{
    id: string
    tasks: Array<{
      id: string
      meta: string
    }>
  }>
}

describe('API integration: task comments meta', () => {
  const app = createApp()

  beforeAll(() => {
    initializeTestDatabase()
  })

  beforeEach(() => {
    resetDatabase()
  })

  async function createAuthedTask() {
    const token = await createToken({
      id: 'u-comments',
      username: 'comments-user',
      displayName: 'Comments User',
      avatar: null,
    })
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    const boardResponse = await app.request('/api/boards', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Comments Board' }),
    })
    const board = await boardResponse.json() as { id: string }

    const detailsResponse = await app.request(`/api/boards/${board.id}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    const details = await detailsResponse.json() as BoardDetails
    const columnId = details.columns[0]!.id

    const createTaskResponse = await app.request(`/api/${board.id}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        columnId,
        title: 'Task with comments',
        priority: 'MEDIUM',
      }),
    })
    const task = await createTaskResponse.json() as { id: string }

    return { authHeaders, boardId: board.id, taskId: task.id }
  }

  async function readTaskMeta(boardId: string, taskId: string, authHeaders: { Authorization: string }) {
    const response = await app.request(`/api/boards/${boardId}`, {
      headers: { Authorization: authHeaders.Authorization },
    })
    const board = await response.json() as BoardDetails
    const task = board.columns.flatMap((column) => column.tasks).find((item) => item.id === taskId)
    expect(task).toBeDefined()
    return JSON.parse(task!.meta) as {
      comments: Array<{
        id: string
        body: string
        author: string
        createdAt: string
        updatedAt?: string
      }>
    }
  }

  it('persists add, edit and delete comment through task meta', async () => {
    const { authHeaders, boardId, taskId } = await createAuthedTask()

    let comments = addTaskComment([], {
      id: 'comment-1',
      body: 'First comment',
      author: 'Ivan',
      createdAt: '2026-01-01T00:00:00.000Z',
    })!
    comments = addTaskComment(comments, {
      id: 'comment-2',
      body: 'Second comment',
      author: 'Maria',
      createdAt: '2026-01-02T00:00:00.000Z',
    })!

    const createMetaResponse = await app.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        meta: JSON.stringify({
          comments,
          attachments: [],
          timeEntries: [],
          richImages: {},
        }),
      }),
    })
    expect(createMetaResponse.status).toBe(200)

    let meta = await readTaskMeta(boardId, taskId, authHeaders)
    expect(meta.comments).toHaveLength(2)
    expect(meta.comments[0]?.body).toBe('Second comment')

    comments = updateTaskComment(comments, 'comment-1', 'First comment edited', '2026-01-03T00:00:00.000Z')!
    const editMetaResponse = await app.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        meta: JSON.stringify({
          comments,
          attachments: [],
          timeEntries: [],
          richImages: {},
        }),
      }),
    })
    expect(editMetaResponse.status).toBe(200)

    meta = await readTaskMeta(boardId, taskId, authHeaders)
    const edited = meta.comments.find((comment) => comment.id === 'comment-1')
    expect(edited).toEqual(expect.objectContaining({
      body: 'First comment edited',
      updatedAt: '2026-01-03T00:00:00.000Z',
    }))

    comments = deleteTaskComment(comments, 'comment-2')
    const deleteMetaResponse = await app.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        meta: JSON.stringify({
          comments,
          attachments: [],
          timeEntries: [],
          richImages: {},
        }),
      }),
    })
    expect(deleteMetaResponse.status).toBe(200)

    meta = await readTaskMeta(boardId, taskId, authHeaders)
    expect(meta.comments).toHaveLength(1)
    expect(meta.comments[0]?.id).toBe('comment-1')
  })
})
