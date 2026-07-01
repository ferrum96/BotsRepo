export function generateTaskNumber(boardId: string, lastNumber: number): number {
  return lastNumber + 1
}

export function formatTaskId(number: number): string {
  return `KAN-${String(number).padStart(3, '0')}`
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

export function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '🔴'
    case 'HIGH': return '🟠'
    case 'MEDIUM': return '🟡'
    case 'LOW': return '🟢'
    default: return '⚪'
  }
}
