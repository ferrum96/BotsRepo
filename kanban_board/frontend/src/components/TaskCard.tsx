'use client'

import { Draggable } from '@hello-pangea/dnd'
import { Clock } from 'lucide-react'
import { TaskWithDetails } from '@/lib/types'
import { LabelBadge } from './LabelBadge'
import { getPriorityColor, formatTaskId } from '@/lib/utils'

type TaskCardProps = {
  task: TaskWithDetails
  index: number
  onClick: () => void
}

export function TaskCard({ task, index, onClick }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-white border rounded-lg p-3 mb-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500 font-mono">
              {formatTaskId(task.taskNumber)}
            </span>
            <span className={`text-sm ${getPriorityColor(task.priority)}`}>
              {task.priority === 'CRITICAL' && '🔴'}
              {task.priority === 'HIGH' && '🟠'}
              {task.priority === 'MEDIUM' && '🟡'}
              {task.priority === 'LOW' && '🟢'}
            </span>
          </div>
          
          <h3 className="font-medium text-sm mb-2 line-clamp-2">{task.title}</h3>
          
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {task.labels.map((tl) => (
                <LabelBadge
                  key={tl.labelId}
                  name={tl.label.name}
                  color={tl.label.color}
                />
              ))}
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              {task.assignee ? (
                <>
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
                    {task.assignee[0]}
                  </div>
                  <span className="truncate max-w-[80px]">{task.assignee}</span>
                </>
              ) : (
                <span className="text-gray-400">Не назначен</span>
              )}
            </div>
            
            {task.estimatedTime && (
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{task.estimatedTime}</span>
              </div>
            )}
          </div>
          
          {task.epic && (
            <div className="mt-2 pt-2 border-t">
              <span
                className="text-xs px-2 py-0.5 rounded"
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
