'use client'

import { Filter, X } from 'lucide-react'
import { Epic } from '@/lib/types'

type FiltersProps = {
  epics: Epic[]
  assignees: string[]
  filters: {
    epicId?: string
    assignee?: string
    epicsOnly?: boolean
    noAssignee?: boolean
  }
  onFilterChange: (filters: FiltersProps['filters']) => void
}

export function Filters({ epics, assignees, filters, onFilterChange }: FiltersProps) {
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <Filter size={16} />
        <span>Фильтры:</span>
      </div>
      
      <button
        onClick={() =>
          onFilterChange({ ...filters, epicsOnly: !filters.epicsOnly })
        }
        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
          filters.epicsOnly
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Только эпики
      </button>
      
      <button
        onClick={() =>
          onFilterChange({ ...filters, noAssignee: !filters.noAssignee })
        }
        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
          filters.noAssignee
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Без исполнителя
      </button>
      
      <select
        value={filters.epicId || ''}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            epicId: e.target.value || undefined,
          })
        }
        className="px-3 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Все эпики</option>
        {epics.map((epic) => (
          <option key={epic.id} value={epic.id}>
            {epic.title}
          </option>
        ))}
      </select>
      
      <select
        value={filters.assignee || ''}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            assignee: e.target.value || undefined,
          })
        }
        className="px-3 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Все исполнители</option>
        {assignees.map((assignee) => (
          <option key={assignee} value={assignee}>
            {assignee}
          </option>
        ))}
      </select>
      
      {activeFilterCount > 0 && (
        <button
          onClick={() => onFilterChange({})}
          className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <X size={14} />
          Сбросить ({activeFilterCount})
        </button>
      )}
    </div>
  )
}
