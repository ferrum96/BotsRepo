'use client'

import { useState, useEffect, useCallback } from 'react'
import { BoardWithDetails, TaskWithDetails, CreateTaskInput, MoveTaskInput, TaskFilters } from '@/lib/types'

export function useBoard(boardId: string | null) {
  const [board, setBoard] = useState<BoardWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const fetchBoard = useCallback(async () => {
    if (!boardId) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/boards/${boardId}`)
      if (!response.ok) throw new Error('Failed to fetch board')
      const data = await response.json()
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
    const response = await fetch(`/api/boards/${boardId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    })
    
    if (!response.ok) throw new Error('Failed to create task')
    
    const newTask = await response.json()
    await fetchBoard()
    return newTask
  }
  
  const updateTask = async (taskId: string, taskData: Partial<CreateTaskInput>) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    })
    
    if (!response.ok) throw new Error('Failed to update task')
    
    await fetchBoard()
  }
  
  const deleteTask = async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) throw new Error('Failed to delete task')
    
    await fetchBoard()
  }
  
  const moveTask = async (taskId: string, moveData: MoveTaskInput) => {
    const response = await fetch(`/api/tasks/${taskId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(moveData),
    })
    
    if (!response.ok) throw new Error('Failed to move task')
    
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