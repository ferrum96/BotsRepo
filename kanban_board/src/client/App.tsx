import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { BoardView } from './components/BoardView'
import { TaskDetailsPage } from './components/TaskDetailsPage'
import { NewTaskPage } from './components/NewTaskPage'
import { api } from './lib/api'
import { useAuth } from './lib/auth'
import { reorderTasksInBoard } from './lib/kanban-utils'
import { Board, BoardWithDetails } from './lib/types'

const STORAGE_KEY = 'kanban-selected-board'

function readStorage(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore Safari private mode storage errors.
  }
}

export default function App() {
  const navigate = useNavigate()
  const { boardId: routeBoardId, taskId } = useParams()
  const { user, logout } = useAuth()
  const [boards, setBoards] = useState<(Board & { _count: { tasks: number } })[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(() => {
    return readStorage(STORAGE_KEY)
  })
  const [board, setBoard] = useState<BoardWithDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (!routeBoardId) return
    setSelectedBoardId(routeBoardId)
    writeStorage(STORAGE_KEY, routeBoardId)
  }, [routeBoardId])

  const fetchBoards = useCallback(async () => {
    try {
      const data = await api.boards.list()
      setBoards(data)
    } catch (err) {
      console.error('Failed to fetch boards:', err)
    }
  }, [])

  const fetchBoard = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedBoardId) {
      setBoard(null)
      setLoading(false)
      return
    }

    const silent = options?.silent ?? false

    try {
      if (!silent) setLoading(true)
      const data = await api.boards.get(selectedBoardId)
      setBoard(data)
    } catch (err) {
      console.error('Failed to fetch board:', err)
    } finally {
      if (!silent) setLoading(false)
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
    writeStorage(STORAGE_KEY, id)
    navigate('/')
  }

  const handleMoveTask = async (taskId: string, columnId: string, position: number) => {
    setBoard((prev) => {
      if (!prev) return prev
      const sourceColumn = prev.columns.find((column) =>
        column.tasks.some((task) => task.id === taskId)
      )
      if (!sourceColumn) return prev

      return reorderTasksInBoard(prev, taskId, sourceColumn.id, columnId, position)
    })

    try {
      await api.tasks.move(taskId, { columnId, position })
    } finally {
      await fetchBoard({ silent: true })
    }
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
        currentUser={user!}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden safari-fix-flex">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Загрузка...</div>
          </div>
        ) : taskId === 'new' && board ? (
          <NewTaskPage
            board={board}
            onCancel={() => navigate('/')}
            onCreateTask={async (data) => {
              const task = await api.tasks.create(board.id, data)
              await fetchBoard()
              await fetchBoards()
              navigate('/')
              return task
            }}
          />
        ) : taskId && board ? (
          <TaskDetailsPage
            board={board}
            taskId={taskId}
            onBack={() => navigate('/')}
            onUpdateTask={async (id, data) => {
              await api.tasks.update(id, data)
              // Avoid full board refetch for metadata-only updates (e.g. inline image insert),
              // otherwise the details form state gets reset while user is editing.
              if (Object.keys(data).length === 1 && 'meta' in data) return
              await fetchBoard()
            }}
          />
        ) : board ? (
          <BoardView
            board={board}
            onMoveTask={handleMoveTask}
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
