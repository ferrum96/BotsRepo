import { Draggable } from '@hello-pangea/dnd'
import { Clock } from 'lucide-react'
import { TaskWithDetails } from '@/lib/types'
import { LabelBadge } from './LabelBadge'
import {
  getPriorityBadgeColor,
  getPriorityLabel,
  formatTaskId,
} from '@/lib/kanban-utils'

type TaskCardProps = {
  task: TaskWithDetails
  index: number
  onClick: () => void
  mobile?: boolean
}

export function TaskCard({ task, index, onClick, mobile }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`flex flex-col overflow-hidden bg-white border border-gray-200 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300 ${
            mobile ? 'h-[200px] p-4 mb-3' : 'h-[170px] p-3 mb-2'
          } ${snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-500 scale-105 z-50' : ''}`}
        >
          <div className="flex items-start justify-between mb-2 shrink-0">
            <span className={`font-mono text-gray-400 ${mobile ? 'text-sm' : 'text-xs'}`}>
              {formatTaskId(task.taskNumber)}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
                mobile ? 'text-xs' : 'text-[11px]'
              } ${getPriorityBadgeColor(task.priority)}`}
            >
              {getPriorityLabel(task.priority)}
            </span>
          </div>

          <div className={`mb-8 shrink-0 ${mobile ? 'h-6' : 'h-5'}`}>
            <h3 className={`truncate font-medium leading-5 text-gray-800 ${mobile ? 'text-base' : 'text-sm'}`}>
              {task.title}
            </h3>
          </div>

          {task.labels.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1 overflow-hidden">
              {task.labels.map((tl) => (
                <LabelBadge key={tl.labelId} name={tl.label.name} color={tl.label.color} />
              ))}
            </div>
          )}

          <div className={`mt-2 flex items-center justify-between text-gray-500 shrink-0 ${mobile ? 'h-6 text-sm' : 'h-5 text-xs'}`}>
            <div className="flex min-w-0 items-center gap-1.5">
              {task.assignee ? (
                <>
                  <div className={`bg-blue-500 rounded-full flex items-center justify-center text-white font-medium shrink-0 ${
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
              <div className="flex items-center gap-1 shrink-0">
                <Clock size={mobile ? 14 : 12} />
                <span>{task.estimatedTime}</span>
              </div>
            )}
          </div>

          <div className="mt-auto flex min-w-0 shrink-0 justify-end border-t border-gray-100 pt-2">
            {task.epic ? (
              <span
                className={`inline-block max-w-full min-w-0 truncate rounded-full px-1.5 py-0.5 leading-4 ${mobile ? 'text-xs' : 'text-[10px]'}`}
                style={{ backgroundColor: task.epic.color + '20', color: task.epic.color }}
              >
                {task.epic.title}
              </span>
            ) : (
              <span className={`invisible inline-block rounded-full px-1.5 py-0.5 leading-4 ${mobile ? 'text-xs' : 'text-[10px]'}`} aria-hidden>
                —
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}
