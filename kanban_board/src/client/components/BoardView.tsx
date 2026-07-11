import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { DragDropContext, DropResult, DragStart, DragUpdate } from '@hello-pangea/dnd'
import { useNavigate } from 'react-router-dom'
import { BoardWithDetails, TaskWithDetails, CreateTaskInput, TaskFilters } from '@/lib/types'
import { reorderTasksInBoard } from '@/lib/kanban-utils'
import { KanbanColumn } from './KanbanColumn'
import { TaskModal } from './TaskModal'
import { EpicModal } from './EpicModal'
import { Filters } from './Filters'

type BoardViewProps = {
  board: BoardWithDetails
  onMoveTask: (taskId: string, columnId: string, position: number) => Promise<void>
  onCreateTask: (data: CreateTaskInput) => Promise<void>
  onUpdateTask: (taskId: string, data: Partial<CreateTaskInput>) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  onCreateEpic: (data: { title: string; description?: string; color: string }) => Promise<void>
  onCreateLabel: (data: { name: string; color: string }) => Promise<void>
  onRefresh: () => void
}

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

export function BoardView({
  board,
  onMoveTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCreateEpic,
  onCreateLabel: _onCreateLabel,
  onRefresh: _onRefresh,
}: BoardViewProps) {
  const navigate = useNavigate()
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showEpicModal, setShowEpicModal] = useState(false)
  const [taskColumnId, setTaskColumnId] = useState('')
  const [filters, setFilters] = useState<TaskFilters>(() => {
    const saved = readStorage(`kanban-filters-${board.id}`)
    if (!saved) return {}
    try {
      return JSON.parse(saved)
    } catch {
      return {}
    }
  })
  const [activeColumnIndex, setActiveColumnIndex] = useState(() => {
    const saved = readStorage(`kanban-column-${board.id}`)
    return saved ? parseInt(saved, 10) : 0
  })
  const [isMobile, setIsMobile] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [displayBoard, setDisplayBoard] = useState(board)
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScrollRef = useRef<number | null>(null)
  const savedColumnRef = useRef<number | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    setDisplayBoard(board)
  }, [board])

  const assignees = useMemo(() => {
    const allAssignees = displayBoard.columns.flatMap((col) =>
      col.tasks
        .map((t) => t.assignee)
        .filter((a): a is string => a !== null && a !== undefined)
    )
    return [...new Set(allAssignees)]
  }, [displayBoard])

  const filteredTasks = useMemo(() => {
    const tasksByColumn: Record<string, TaskWithDetails[]> = {}
    displayBoard.columns.forEach((col) => {
      tasksByColumn[col.id] = col.tasks
        .filter((task) => {
          if (filters.epicId && task.epicId !== filters.epicId) return false
          if (filters.assignee && task.assignee !== filters.assignee) return false
          if (filters.epicsOnly && !task.epic) return false
          if (filters.noAssignee && task.assignee) return false
          return true
        })
        .sort((a, b) => a.position - b.position)
    })
    return tasksByColumn
  }, [displayBoard, filters])

  const scrollToColumn = useCallback((index: number) => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const columnWidth = container.offsetWidth
    container.scrollTo({ left: index * columnWidth, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!isMobile || !scrollRef.current) return
    const container = scrollRef.current

    const onScroll = () => {
      if (programmaticScroll.current || boardUpdating.current) return
      const idx = Math.round(container.scrollLeft / container.offsetWidth)
      if (idx >= 0 && idx < displayBoard.columns.length) {
        setActiveColumnIndex(idx)
      }
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [isMobile, displayBoard.columns.length])

  useEffect(() => {
    if (isMobile) scrollToColumn(activeColumnIndex)
  }, [isMobile])

  useLayoutEffect(() => {
    if (savedScrollRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = savedScrollRef.current
      savedScrollRef.current = null
    }
    if (savedColumnRef.current !== null) {
      setActiveColumnIndex(savedColumnRef.current)
      savedColumnRef.current = null
    }
    boardUpdating.current = false
  }, [board])

  useEffect(() => {
    writeStorage(`kanban-filters-${board.id}`, JSON.stringify(filters))
  }, [filters, board.id])

  useEffect(() => {
    writeStorage(`kanban-column-${board.id}`, String(activeColumnIndex))
  }, [activeColumnIndex, board.id])

  const goToColumn = useCallback((index: number) => {
    if (index < 0 || index >= displayBoard.columns.length) return
    setActiveColumnIndex(index)
    programmaticScroll.current = true
    scrollToColumn(index)
    setTimeout(() => { programmaticScroll.current = false }, 400)
  }, [displayBoard.columns.length, scrollToColumn])

  const lastSwitchTime = useRef(0)
  const programmaticScroll = useRef(false)
  const boardUpdating = useRef(false)

  const checkEdgeAndSwitch = useCallback((x: number) => {
    if (!isMobile || !isDragging) return
    const now = Date.now()
    if (now - lastSwitchTime.current < 500) return

    const edge = 60
    const w = window.innerWidth
    if (x < edge && activeColumnIndex > 0) {
      lastSwitchTime.current = now
      goToColumn(activeColumnIndex - 1)
    } else if (x > w - edge && activeColumnIndex < displayBoard.columns.length - 1) {
      lastSwitchTime.current = now
      goToColumn(activeColumnIndex + 1)
    }
  }, [isMobile, isDragging, activeColumnIndex, displayBoard.columns.length, goToColumn])

  useEffect(() => {
    if (!isDragging || !isMobile) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX
      checkEdgeAndSwitch(x)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
    }
  }, [isDragging, isMobile, checkEdgeAndSwitch])

  const getMovePosition = useCallback(
    (columnId: string, sourceColumnId: string, dropIndex: number, taskId: string) => {
      const filtered = filteredTasks[columnId] || []
      const fullTasks =
        displayBoard.columns
          .find((c) => c.id === columnId)
          ?.tasks.slice()
          .sort((a, b) => a.position - b.position) || []
      const isSameColumn = columnId === sourceColumnId

      if (dropIndex >= filtered.length) {
        return isSameColumn ? Math.max(0, fullTasks.length - 1) : fullTasks.length
      }

      const refTask = filtered[dropIndex]
      const refFullIndex = fullTasks.findIndex((t) => t.id === refTask.id)
      if (refFullIndex === -1) {
        return isSameColumn
          ? Math.max(0, Math.min(dropIndex, fullTasks.length - 1))
          : Math.min(dropIndex, fullTasks.length)
      }

      return refFullIndex
    },
    [displayBoard, filteredTasks]
  )

  const handleDragStart = () => { if (isMobile) setIsDragging(true) }

  const handleDragUpdate = (update: DragUpdate) => {
    if (isMobile && update.destination) {
      const destIdx = displayBoard.columns.findIndex(c => c.id === update.destination?.droppableId)
      if (destIdx !== -1 && destIdx !== activeColumnIndex) {
        setActiveColumnIndex(destIdx)
        scrollToColumn(destIdx)
      }
    }
  }

  const handleDragEnd = async (result: DropResult) => {
    const { source, draggableId } = result
    let { destination } = result
    const wasDragging = isDragging
    setIsDragging(false)

    if (isMobile && wasDragging) {
      const targetColumn = displayBoard.columns[activeColumnIndex]
      if (targetColumn && targetColumn.id !== source.droppableId) {
        const targetTasks = filteredTasks[targetColumn.id] || []
        destination = { droppableId: targetColumn.id, index: targetTasks.length }
      }
    }

    if (!destination) return

    if (destination.droppableId === source.droppableId) {
      if (destination.index === source.index) return
    }

    savedScrollRef.current = scrollRef.current?.scrollLeft ?? 0
    savedColumnRef.current = activeColumnIndex
    boardUpdating.current = true

    const targetPosition = getMovePosition(
      destination.droppableId,
      source.droppableId,
      destination.index,
      draggableId
    )

    setDisplayBoard((prev) =>
      reorderTasksInBoard(prev, draggableId, source.droppableId, destination.droppableId, targetPosition)
    )

    try {
      await onMoveTask(draggableId, destination.droppableId, targetPosition)
    } catch {
      setDisplayBoard(board)
    }
  }

  const handleAddTask = () => {
    setTaskColumnId(displayBoard.columns[activeColumnIndex]?.id || displayBoard.columns[0]?.id || '')
    setSelectedTask(null)
    setShowTaskModal(true)
  }

  const handleTaskClick = (task: TaskWithDetails) => {
    navigate(`/boards/${displayBoard.id}/tasks/${task.id}`)
  }

  const handleSaveTask = async (data: CreateTaskInput) => {
    if (selectedTask) {
      await onUpdateTask(selectedTask.id, data)
    } else {
      await onCreateTask({ ...data, columnId: taskColumnId })
    }
  }

  const handleDeleteTask = async () => {
    if (selectedTask) await onDeleteTask(selectedTask.id)
  }

  const currentColumn = displayBoard.columns[activeColumnIndex]

  return (
    <div className="flex-1 flex flex-col overflow-hidden safari-fix-flex">
      <div className="p-4 md:p-6 border-b border-gray-200 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="pl-12 md:pl-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">{displayBoard.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {displayBoard.columns.reduce((acc, col) => acc + col.tasks.length, 0)} задач
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowEpicModal(true)} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              + Эпик
            </button>
            <button onClick={handleAddTask} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Новая задача
            </button>
          </div>
        </div>
        <div className="mt-4">
          <Filters epics={displayBoard.epics} assignees={assignees} filters={filters} onFilterChange={setFilters} />
        </div>
      </div>

      {isMobile ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100 bg-white flex-shrink-0">
            <span className="text-sm font-medium text-gray-700">{currentColumn?.title}</span>
            <span className="text-xs text-gray-400">{activeColumnIndex + 1} / {displayBoard.columns.length}</span>
          </div>

          <DragDropContext onDragStart={handleDragStart} onDragUpdate={handleDragUpdate} onDragEnd={handleDragEnd}>
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory flex safari-scroll"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {displayBoard.columns.map((column) => (
                <div key={column.id} className="flex-shrink-0 w-full h-full snap-center px-3 py-2">
                  <KanbanColumn column={column} tasks={filteredTasks[column.id] || []} onTaskClick={handleTaskClick} mobile />
                </div>
              ))}
            </div>
          </DragDropContext>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-x-auto scrollbar-none safari-scroll p-4 md:p-6 pb-20">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full">
              {displayBoard.columns.map((column) => (
                <KanbanColumn key={column.id} column={column} tasks={filteredTasks[column.id] || []} onTaskClick={handleTaskClick} />
              ))}
            </div>
          </DragDropContext>
        </div>
      )}

      {showTaskModal && (
        <TaskModal task={selectedTask} columnId={taskColumnId} columns={displayBoard.columns} epics={displayBoard.epics} labels={displayBoard.labels}
          onClose={() => { setShowTaskModal(false); setSelectedTask(null) }}
          onSave={handleSaveTask}
          onDelete={selectedTask ? handleDeleteTask : undefined}
        />
      )}

      {showEpicModal && (
        <EpicModal onClose={() => setShowEpicModal(false)} onSave={async (data) => { await onCreateEpic(data); setShowEpicModal(false) }} />
      )}
    </div>
  )
}
