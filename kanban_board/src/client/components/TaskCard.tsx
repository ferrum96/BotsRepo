import { Draggable } from '@hello-pangea/dnd'
import { Clock } from 'lucide-react'
import { TaskWithDetails } from '@/lib/types'
import { LabelBadge } from './LabelBadge'
import { getPriorityColor, formatTaskId } from '@/lib/kanban-utils'

type TaskCardProps = {
  task: TaskWithDetails
  index: number
  onClick: () => void
  mobile?: boolean
}

export function TaskCard({ task, index, onClick, mobile }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index} dropAnimation={{
      duration: 250,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    }}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-white border border-gray-200 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300 ${
            mobile ? 'p-4 mb-3' : 'p-3 mb-2'
          } ${snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-500 scale-105 z-50' : ''}`}
        >
          <div className="flex items-start justify-between mb-2">
            <span className={`font-mono text-gray-400 ${mobile ? 'text-sm' : 'text-xs'}`}>
              {formatTaskId(task.taskNumber)}
            </span>
            <span className={getPriorityColor(task.priority)}>
              {task.priority === 'CRITICAL' && '🔴'}
              {task.priority === 'HIGH' && '🟠'}
              {task.priority === 'MEDIUM' && '🟡'}
              {task.priority === 'LOW' && '🟢'}
            </span>
          </div>

          <h3 className={`font-medium text-gray-800 mb-2 line-clamp-2 safari-line-clamp ${mobile ? 'text-base' : 'text-sm'}`}>
            {task.title}
          </h3>

          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {task.labels.map((tl) => (
                <LabelBadge key={tl.labelId} name={tl.label.name} color={tl.label.color} />
              ))}
            </div>
          )}

          <div className={`flex items-center justify-between text-gray-500 ${mobile ? 'text-sm' : 'text-xs'}`}>
            <div className="flex items-center gap-1.5">
              {task.assignee ? (
                <>
                  <div className={`bg-blue-500 rounded-full flex items-center justify-center text-white font-medium ${
                    mobile ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'
                  }`}>
                    {task.assignee[0]}
                  </div>
                  <span className="truncate max-w-[100px]">{task.assignee}</span>
                </>
              ) : (
                <span className="text-gray-400">Не назначен</span>
              )}
            </div>

            {task.estimatedTime && (
              <div className="flex items-center gap-1">
                <Clock size={mobile ? 14 : 12} />
                <span>{task.estimatedTime}</span>
              </div>
            )}
          </div>

          {task.epic && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <span
                className={`px-2 py-0.5 rounded-full ${mobile ? 'text-sm' : 'text-xs'}`}
                style={{ backgroundColor: task.epic.color + '20', color: task.epic.color }}
              >
                {task.epic.title}
              </span>
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
