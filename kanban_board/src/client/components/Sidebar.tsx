import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, Plus, ChevronLeft, ChevronRight, Trash2, Pencil, Menu } from 'lucide-react'
import { CreateBoardModal } from './CreateBoardModal'
import { api } from '@/lib/api'

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

const SIDEBAR_KEY = 'kanban-sidebar-collapsed'

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

export function Sidebar({ boards, selectedBoardId, onSelectBoard, onBoardCreated }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    return readStorage(SIDEBAR_KEY) === 'true'
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const handleToggle = () => {
    const next = !collapsed
    setCollapsed(next)
    writeStorage(SIDEBAR_KEY, String(next))
  }

  useEffect(() => {
    if (selectedBoardId) {
      setMobileOpen(false)
    }
  }, [selectedBoardId])

  const handleDeleteBoard = async (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation()
    if (!confirm('Удалить доску? Все задачи будут удалены.')) return
    await api.boards.delete(boardId)
    if (selectedBoardId === boardId) {
      onSelectBoard('')
    }
    onBoardCreated()
  }

  const startEditing = (e: React.MouseEvent, board: Board) => {
    e.stopPropagation()
    setEditingBoardId(board.id)
    setEditingName(board.name)
  }

  const saveEditing = async () => {
    if (!editingBoardId || !editingName.trim()) {
      setEditingBoardId(null)
      return
    }
    await api.boards.update(editingBoardId, { name: editingName.trim() })
    setEditingBoardId(null)
    onBoardCreated()
  }

  const cancelEditing = () => {
    setEditingBoardId(null)
  }

  useEffect(() => {
    if (editingBoardId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingBoardId])

  const isExpanded = !collapsed

  return (
    <>
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 bg-gray-900 text-white rounded-lg md:hidden"
        >
          <Menu size={20} />
        </button>
      )}

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed md:relative z-40 h-full bg-gray-900 text-white transition-all duration-300 flex flex-col safari-fix-flex ${
          collapsed ? 'md:w-16' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-700 min-h-[60px]">
          <span
            className={`font-bold text-lg whitespace-nowrap overflow-hidden transition-all duration-300 ${
              isExpanded ? 'opacity-100 w-auto' : 'md:opacity-0 md:w-0'
            }`}
          >
            Kanban Board
          </span>
          {/* <button
            type="button"
            onClick={handleToggle}
            className="p-2 hover:bg-gray-700 rounded hidden md:flex items-center justify-center flex-shrink-0"
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button> */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-2 hover:bg-gray-700 rounded md:hidden flex-shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto safari-scroll p-2">
          <div className={`flex items-center mb-2 px-2 ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <span
              className={`text-xs text-gray-400 uppercase whitespace-nowrap overflow-hidden transition-all duration-300 ${
                isExpanded ? 'opacity-100 w-auto' : 'md:opacity-0 md:w-0'
              }`}
            >
              Доски
            </span>
            {/* <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="p-1 hover:bg-gray-700 rounded flex-shrink-0"
            >
              <Plus size={16} />
            </button> */}
          </div>

          {boards.map((board) => (
            <div
              key={board.id}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded mb-1 transition-colors group ${
                selectedBoardId === board.id
                  ? 'bg-blue-600'
                  : 'hover:bg-gray-700'
              }`}
            >
              <div
                className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                onClick={() => onSelectBoard(board.id)}
              >
                <LayoutDashboard size={18} className="flex-shrink-0" />
                <div
                  className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
                    isExpanded ? 'opacity-100 w-auto' : 'md:opacity-0 md:w-0'
                  }`}
                >
                  {editingBoardId === board.id ? (
                    <input
                      ref={editInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditing()
                        if (e.key === 'Escape') cancelEditing()
                      }}
                      onBlur={saveEditing}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-gray-800 text-white text-sm rounded px-1 py-0.5 outline-none ring-1 ring-blue-500"
                    />
                  ) : (
                    <div className="truncate">
                      {board.name}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">{board._count.tasks} задач</div>
                </div>
              </div>
              {isExpanded && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => startEditing(e, board)}
                    className="p-1 hover:bg-gray-600 rounded"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteBoard(e, board.id)}
                    className="p-1 hover:bg-gray-600 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
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
