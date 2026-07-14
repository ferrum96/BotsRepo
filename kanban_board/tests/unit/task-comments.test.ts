import { describe, expect, it } from 'vitest'
import {
  addTaskComment,
  deleteTaskComment,
  updateTaskComment,
  type TaskComment,
} from '../../src/client/lib/task-comments.js'

const base: TaskComment = {
  id: 'c1',
  body: 'Hello',
  author: 'Ivan',
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('task-comments', () => {
  it('adds comment at the front', () => {
    const next = addTaskComment([base], {
      id: 'c2',
      body: '  New note  ',
      author: 'Maria',
      createdAt: '2026-01-02T00:00:00.000Z',
    })

    expect(next).toEqual([
      {
        id: 'c2',
        body: 'New note',
        author: 'Maria',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      base,
    ])
  })

  it('rejects empty comment body on add', () => {
    expect(addTaskComment([], { id: 'c2', body: '   ', author: 'Ivan' })).toBeNull()
  })

  it('falls back to You when author blank', () => {
    const next = addTaskComment([], {
      id: 'c2',
      body: 'Note',
      author: '  ',
      createdAt: '2026-01-02T00:00:00.000Z',
    })
    expect(next?.[0]?.author).toBe('You')
  })

  it('updates comment body and sets updatedAt', () => {
    const next = updateTaskComment([base], 'c1', '  Edited  ', '2026-01-03T00:00:00.000Z')
    expect(next).toEqual([
      {
        ...base,
        body: 'Edited',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
    ])
  })

  it('rejects empty body or missing id on update', () => {
    expect(updateTaskComment([base], 'c1', '   ')).toBeNull()
    expect(updateTaskComment([base], 'missing', 'Edited')).toBeNull()
  })

  it('deletes comment by id', () => {
    const other: TaskComment = {
      id: 'c2',
      body: 'Keep me',
      author: 'Maria',
      createdAt: '2026-01-02T00:00:00.000Z',
    }
    expect(deleteTaskComment([base, other], 'c1')).toEqual([other])
    expect(deleteTaskComment([base], 'missing')).toEqual([base])
  })
})
