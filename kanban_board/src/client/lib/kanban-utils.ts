export function generateTaskNumber(boardId: string, lastNumber: number): number {
  return lastNumber + 1
}

export function formatTaskId(number: number): string {
  return `TASK-${String(number).padStart(3, '0')}`
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return 'text-red-600'
    case 'HIGH': return 'text-orange-500'
    case 'MEDIUM': return 'text-yellow-500'
    case 'LOW': return 'text-green-500'
    default: return 'text-gray-500'
  }
}

export function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return 'Критический'
    case 'HIGH': return 'Высокий'
    case 'MEDIUM': return 'Средний'
    case 'LOW': return 'Низкий'
    default: return priority
  }
}

export function getPriorityBadgeColor(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return 'bg-red-100 text-red-700'
    case 'HIGH': return 'bg-orange-100 text-orange-700'
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-700'
    case 'LOW': return 'bg-green-100 text-green-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

export function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '🔴'
    case 'HIGH': return '🟠'
    case 'MEDIUM': return '🟡'
    case 'LOW': return '🟢'
    default: return '⚪'
  }
}

export function reorderTasksInBoard<
  T extends { id: string; columns: { id: string; tasks: { id: string; columnId: string; position: number }[] }[] }
>(
  board: T,
  taskId: string,
  sourceColumnId: string,
  targetColumnId: string,
  targetIndex: number
): T {
  const sourceColumn = board.columns.find((c) => c.id === sourceColumnId)
  const targetColumn = board.columns.find((c) => c.id === targetColumnId)
  if (!sourceColumn || !targetColumn) return board

  const movedTask = sourceColumn.tasks.find((t) => t.id === taskId)
  if (!movedTask) return board

  type ColumnTask = T['columns'][number]['tasks'][number]

  const reassignPositions = (tasks: ColumnTask[]) =>
    tasks.map((t, idx) => ({ ...t, position: idx }))

  const newColumns = board.columns.map((col) => {
    if (col.id !== sourceColumnId && col.id !== targetColumnId) return col

    let nextTasks: ColumnTask[]

    const sortedOthers = col.tasks
      .filter((t) => t.id !== taskId)
      .sort((a, b) => a.position - b.position)
    const insertIndex = Math.max(0, Math.min(targetIndex, sortedOthers.length))

    if (col.id === sourceColumnId && col.id === targetColumnId) {
      nextTasks = [
        ...sortedOthers.slice(0, insertIndex),
        movedTask,
        ...sortedOthers.slice(insertIndex),
      ]
    } else if (col.id === sourceColumnId) {
      nextTasks = sortedOthers
    } else {
      nextTasks = [
        ...sortedOthers.slice(0, insertIndex),
        { ...movedTask, columnId: targetColumnId } as ColumnTask,
        ...sortedOthers.slice(insertIndex),
      ]
    }

    return { ...col, tasks: reassignPositions(nextTasks) }
  })

  return { ...board, columns: newColumns }
}
