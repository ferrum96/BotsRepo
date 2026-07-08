import { useState, useEffect, useCallback } from 'react'
import { BoardWithDetails, CreateTaskInput, MoveTaskInput } from './types'
import { api } from './api'

export function useBoard(boardId: string | null) {
  const [board, setBoard] = useState<BoardWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBoard = useCallback(async () => {
    if (!boardId) return

    try {
      setLoading(true)
      const data = await api.boards.get(boardId)
      setBoard(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  const createTask = async (taskData: CreateTaskInput) => {
    const newTask = await api.tasks.create(boardId!, taskData)
    await fetchBoard()
    return newTask
  }

  const updateTask = async (taskId: string, taskData: Partial<CreateTaskInput>) => {
    await api.tasks.update(taskId, taskData)
    await fetchBoard()
  }

  const deleteTask = async (taskId: string) => {
    await api.tasks.delete(taskId)
    await fetchBoard()
  }

  const moveTask = async (taskId: string, moveData: MoveTaskInput) => {
    await api.tasks.move(taskId, moveData)
    await fetchBoard()
  }

  return {
    board,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    refresh: fetchBoard,
  }
}
