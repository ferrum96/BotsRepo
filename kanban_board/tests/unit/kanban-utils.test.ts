import { describe, expect, it } from 'vitest'
import {
  formatTaskId,
  generateTaskNumber,
  getPriorityBadgeColor,
  getPriorityColor,
  getPriorityIcon,
  getPriorityLabel,
  reorderTasksInBoard,
} from '../../src/client/lib/kanban-utils.js'

describe('kanban-utils', () => {
  it('formats task ids with left padding', () => {
    expect(formatTaskId(7)).toBe('TASK-007')
    expect(formatTaskId(157)).toBe('TASK-157')
  })

  it('increments task number regardless of board id', () => {
    expect(generateTaskNumber('board-a', 0)).toBe(1)
    expect(generateTaskNumber('board-a', 9)).toBe(10)
  })

  it('returns expected priority styles and labels', () => {
    expect(getPriorityColor('HIGH')).toBe('text-orange-500')
    expect(getPriorityBadgeColor('LOW')).toBe('bg-green-100 text-green-700')
    expect(getPriorityIcon('CRITICAL')).toBe('🔴')
    expect(getPriorityLabel('MEDIUM')).toBe('Средний')
    expect(getPriorityLabel('CUSTOM')).toBe('CUSTOM')
  })

  it('reorders task in same column and updates positions', () => {
    const board = {
      id: 'board-1',
      columns: [
        {
          id: 'col-1',
          tasks: [
            { id: 't1', columnId: 'col-1', position: 0 },
            { id: 't2', columnId: 'col-1', position: 1 },
            { id: 't3', columnId: 'col-1', position: 2 },
          ],
        },
      ],
    }

    const next = reorderTasksInBoard(board, 't1', 'col-1', 'col-1', 2)
    expect(next.columns[0].tasks.map((task) => task.id)).toEqual(['t2', 't3', 't1'])
    expect(next.columns[0].tasks.map((task) => task.position)).toEqual([0, 1, 2])
  })

  it('moves task across columns and reassigns positions', () => {
    const board = {
      id: 'board-1',
      columns: [
        {
          id: 'col-1',
          tasks: [
            { id: 't1', columnId: 'col-1', position: 0 },
            { id: 't2', columnId: 'col-1', position: 1 },
          ],
        },
        {
          id: 'col-2',
          tasks: [{ id: 't3', columnId: 'col-2', position: 0 }],
        },
      ],
    }

    const next = reorderTasksInBoard(board, 't2', 'col-1', 'col-2', 0)

    expect(next.columns[0].tasks.map((task) => task.id)).toEqual(['t1'])
    expect(next.columns[0].tasks.map((task) => task.position)).toEqual([0])

    expect(next.columns[1].tasks.map((task) => task.id)).toEqual(['t2', 't3'])
    expect(next.columns[1].tasks[0].columnId).toBe('col-2')
    expect(next.columns[1].tasks.map((task) => task.position)).toEqual([0, 1])
  })
})
