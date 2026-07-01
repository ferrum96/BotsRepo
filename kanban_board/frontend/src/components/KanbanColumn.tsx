'use client'

import { Droppable } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { Column, TaskWithDetails } from '@/lib/types'
import { TaskCard } from './TaskCard'

type KanbanColumnProps = {
  column: Column
  tasks: TaskWithDetails[]
  onTaskClick: (task: TaskWithDetails) => void
  onAddTask: () => void
}

export function KanbanColumn({ column, tasks, onTaskClick, onAddTask }: KanbanColumnProps) {
  const taskCount = tasks.length
  const isOverLimit = column.wipLimit && taskCount > column.wipLimit
  
  return (
    <div className="flex-shrink-0 w-72 bg-gray-100 rounded-lg flex flex-col max-h-[calc(100vh-140px)]">
      <div className="h-1 w-full rounded-full" style={{ backgroundColor: column.color }} />
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm uppercase">{column.title}</h3>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isOverLimit ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
              {taskCount}
              {column.wipLimit && ` / ${column.wipLimit}`}
            </span>
            <button
              onClick={onAddTask}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
      
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto p-2 min-h-[100px] transition-colors ${
              snapshot.isDraggingOver ? 'bg-blue-50' : ''
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
