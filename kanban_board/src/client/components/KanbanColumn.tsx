import { Droppable } from '@hello-pangea/dnd'
import { Column, TaskWithDetails } from '@/lib/types'
import { TaskCard } from './TaskCard'

type KanbanColumnProps = {
  column: Column
  tasks: TaskWithDetails[]
  onTaskClick: (task: TaskWithDetails) => void
  mobile?: boolean
}

export function KanbanColumn({ column, tasks, onTaskClick, mobile }: KanbanColumnProps) {
  const taskCount = tasks.length
  const isOverLimit = column.wipLimit && taskCount > column.wipLimit

  return (
    <div className={`w-full bg-gray-50 rounded-xl flex flex-col border border-gray-200 overflow-hidden ${
      mobile ? 'h-full' : 'md:flex-1 md:min-w-[300px] md:max-w-[400px] h-full'
    }`}>
      <div className="h-1.5 w-full rounded-t-xl" style={{ backgroundColor: column.color }} />
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-700">{column.title}</h3>
          <span className={`text-sm font-medium ${isOverLimit ? 'text-red-500' : 'text-gray-400'}`}>
            {taskCount}
            {column.wipLimit && ` / ${column.wipLimit}`}
          </span>
        </div>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto scrollbar-none safari-scroll p-2 min-h-[100px] transition-colors duration-200 ${
              snapshot.isDraggingOver ? 'bg-blue-50' : ''
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onTaskClick(task)}
                mobile={mobile}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
