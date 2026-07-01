'use client'

import { useState, useMemo } from 'react'
import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { BoardWithDetails, TaskWithDetails, CreateTaskInput, TaskFilters } from '@/lib/types'
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
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showEpicModal, setShowEpicModal] = useState(false)
  const [taskColumnId, setTaskColumnId] = useState('')
  const [filters, setFilters] = useState<TaskFilters>({})

  const assignees = useMemo(() => {
    const allAssignees = board.columns.flatMap((col) =>
      col.tasks
        .map((t) => t.assignee)
        .filter((a): a is string => a !== null && a !== undefined)
    )
    return [...new Set(allAssignees)]
  }, [board])

  const filteredTasks = useMemo(() => {
    const tasksByColumn: Record<string, TaskWithDetails[]> = {}

    board.columns.forEach((col) => {
      tasksByColumn[col.id] = col.tasks.filter((task) => {
        if (filters.epicId && task.epicId !== filters.epicId) return false
        if (filters.assignee && task.assignee !== filters.assignee) return false
        if (filters.epicsOnly && !task.epic) return false
        if (filters.noAssignee && task.assignee) return false
        return true
      })
    })

    return tasksByColumn
  }, [board, filters])

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result

    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    await onMoveTask(draggableId, destination.droppableId, destination.index)
  }

  const handleAddTask = (columnId: string) => {
    setTaskColumnId(columnId)
    setSelectedTask(null)
    setShowTaskModal(true)
  }

  const handleTaskClick = (task: TaskWithDetails) => {
    setSelectedTask(task)
    setTaskColumnId(task.columnId)
    setShowTaskModal(true)
  }

  const handleSaveTask = async (data: CreateTaskInput) => {
    if (selectedTask) {
      await onUpdateTask(selectedTask.id, data)
    } else {
      await onCreateTask({ ...data, columnId: taskColumnId })
    }
  }

  const handleDeleteTask = async () => {
    if (selectedTask) {
      await onDeleteTask(selectedTask.id)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{board.name}</h1>
            <p className="text-sm text-gray-500">
              {board.columns.reduce((acc, col) => acc + col.tasks.length, 0)} задач
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEpicModal(true)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              + Эпик
            </button>
            <button
              onClick={() => handleAddTask(board.columns[0]?.id)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Новая задача
            </button>
          </div>
        </div>

        <Filters
          epics={board.epics}
          assignees={assignees}
          filters={filters}
          onFilterChange={setFilters}
        />
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={filteredTasks[column.id] || []}
                onTaskClick={handleTaskClick}
                onAddTask={() => handleAddTask(column.id)}
              />
            ))}
          </div>
        </DragDropContext>
      </div>

      {showTaskModal && (
        <TaskModal
          task={selectedTask}
          columnId={taskColumnId}
          columns={board.columns}
          epics={board.epics}
          labels={board.labels}
          onClose={() => {
            setShowTaskModal(false)
            setSelectedTask(null)
          }}
          onSave={handleSaveTask}
          onDelete={selectedTask ? handleDeleteTask : undefined}
        />
      )}

      {showEpicModal && (
        <EpicModal
          onClose={() => setShowEpicModal(false)}
          onSave={async (data) => {
            await onCreateEpic(data)
            setShowEpicModal(false)
          }}
        />
      )}
    </div>
  )
}
