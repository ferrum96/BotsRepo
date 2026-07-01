'use client'

import { useState } from 'react'
import { LayoutDashboard, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { CreateBoardModal } from './CreateBoardModal'

type Board = {
  id: string
  name: string
  _count: { tasks: number }
}

type SidebarProps = {
  boards: Board[]
  selectedBoardId: string | null
  onSelectBoard: (id: string) => void
  onBoardCreated: () => void
}

export function Sidebar({ boards, selectedBoardId, onSelectBoard, onBoardCreated }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  return (
    <>
      <aside
        className={`bg-gray-900 text-white transition-all duration-300 flex flex-col ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {!collapsed && <h1 className="font-bold text-lg">Kanban Board</h1>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 hover:bg-gray-700 rounded"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {!collapsed && (
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs text-gray-400 uppercase">Доски</span>
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <Plus size={16} />
              </button>
            </div>
          )}
          
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded mb-1 text-left transition-colors ${
                selectedBoardId === board.id
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-700'
              }`}
            >
              <LayoutDashboard size={18} />
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="truncate">{board.name}</div>
                  <div className="text-xs text-gray-400">{board._count.tasks} задач</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </aside>
      
      {showCreateModal && (
        <CreateBoardModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            onBoardCreated()
          }}
        />
      )}
    </>
  )
}