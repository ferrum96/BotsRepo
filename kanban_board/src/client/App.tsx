import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { BoardView } from './components/BoardView'
import { api } from './lib/api'
import { Board, BoardWithDetails } from './lib/types'

const STORAGE_KEY = 'kanban-selected-board'

export default function App() {
  const [boards, setBoards] = useState<(Board & { _count: { tasks: number } })[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY)
  })
  const [board, setBoard] = useState<BoardWithDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBoards = useCallback(async () => {
    try {
      const data = await api.boards.list()
      setBoards(data)
    } catch (err) {
      console.error('Failed to fetch boards:', err)
    }
  }, [])

  const fetchBoard = useCallback(async () => {
    if (!selectedBoardId) {
      setBoard(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await api.boards.get(selectedBoardId)
      setBoard(data)
    } catch (err) {
      console.error('Failed to fetch board:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedBoardId])

  useEffect(() => {
    fetchBoards()
  }, [fetchBoards])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  const handleSelectBoard = (id: string) => {
    setSelectedBoardId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const handleMoveTask = async (taskId: string, columnId: string, position: number) => {
    await api.tasks.move(taskId, { columnId, position })
    await fetchBoard()
  }

  const handleCreateTask = async (data: any) => {
    await api.tasks.create(selectedBoardId!, data)
    await fetchBoard()
    await fetchBoards()
  }

  const handleUpdateTask = async (taskId: string, data: any) => {
    await api.tasks.update(taskId, data)
    await fetchBoard()
  }

  const handleDeleteTask = async (taskId: string) => {
    await api.tasks.delete(taskId)
    await fetchBoard()
    await fetchBoards()
  }

  const handleCreateEpic = async (data: { title: string; description?: string; color: string }) => {
    await api.epics.create(selectedBoardId!, data)
    await fetchBoard()
  }

  const handleCreateLabel = async (data: { name: string; color: string }) => {
    await api.labels.create(selectedBoardId!, data)
    await fetchBoard()
  }

  return (
    <div className="flex h-[100dvh] h-screen bg-gray-100">
      <Sidebar
        boards={boards}
        selectedBoardId={selectedBoardId}
        onSelectBoard={handleSelectBoard}
        onBoardCreated={fetchBoards}
      />

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden safari-fix-flex">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Загрузка...</div>
          </div>
        ) : board ? (
          <BoardView
            board={board}
            onMoveTask={handleMoveTask}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onCreateEpic={handleCreateEpic}
            onCreateLabel={handleCreateLabel}
            onRefresh={fetchBoard}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Выберите доску</div>
          </div>
        )}
      </main>
    </div>
  )
}
