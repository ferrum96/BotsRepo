'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { BoardView } from '@/components/BoardView'
import { useBoard } from '@/hooks/useBoard'

type Board = {
  id: string
  name: string
  _count: { tasks: number }
}

export default function Home() {
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [loadingBoards, setLoadingBoards] = useState(true)
  
  const { board, loading: loadingBoard, createTask, updateTask, deleteTask, moveTask, refresh } =
    useBoard(selectedBoardId)
  
  const fetchBoards = async () => {
    try {
      const response = await fetch('/api/boards')
      const data = await response.json()
      setBoards(data)
    } finally {
      setLoadingBoards(false)
    }
  }
  
  useEffect(() => {
    fetchBoards()
  }, [])
  
  const handleCreateEpic = async (data: { title: string; description?: string; color: string }) => {
    if (!selectedBoardId) return
    
    await fetch(`/api/boards/${selectedBoardId}/epics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    
    refresh()
  }
  
  const handleMoveTask = async (taskId: string, columnId: string, position: number) => {
    await moveTask(taskId, { columnId, position })
  }
  
  const handleCreateLabel = async (data: { name: string; color: string }) => {
    if (!selectedBoardId) return
    
    await fetch(`/api/boards/${selectedBoardId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    
    refresh()
  }
  
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        boards={boards}
        selectedBoardId={selectedBoardId}
        onSelectBoard={setSelectedBoardId}
        onBoardCreated={fetchBoards}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {loadingBoards ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Загрузка...</div>
          </div>
        ) : boards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl text-gray-600">Нет досок</h2>
            <p className="text-gray-400">Создайте первую доску для начала работы</p>
          </div>
        ) : !selectedBoardId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl text-gray-600">Выберите доску</h2>
            <p className="text-gray-400">или создайте новую в боковой панели</p>
          </div>
        ) : loadingBoard ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Загрузка доски...</div>
          </div>
        ) : board ? (
          <BoardView
            board={board}
            onMoveTask={handleMoveTask}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onCreateEpic={handleCreateEpic}
            onCreateLabel={handleCreateLabel}
            onRefresh={refresh}
          />
        ) : null}
      </main>
    </div>
  )
}
