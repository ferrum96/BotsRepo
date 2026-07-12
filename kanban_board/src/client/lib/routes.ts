import { formatTaskId } from './kanban-utils'

type BoardRouteItem = {
  id: string
  name: string
}

export function slugifyBoardName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'board'
}

export function buildBoardPath(board: BoardRouteItem) {
  return `/boards/${slugifyBoardName(board.name)}`
}

export function buildTaskPath(board: BoardRouteItem, taskRef: string | number) {
  const normalizedTaskRef = typeof taskRef === 'number' ? formatTaskId(taskRef) : taskRef
  return `${buildBoardPath(board)}/tasks/${normalizedTaskRef}`
}

export function normalizeTaskRouteRef(taskRef: string) {
  return decodeURIComponent(taskRef).trim().toUpperCase()
}

export function resolveBoardIdFromRoute(routeBoardRef: string, boards: BoardRouteItem[]) {
  const routeRef = decodeURIComponent(routeBoardRef).trim().toLowerCase()
  const byId = boards.find((board) => board.id === routeBoardRef)
  if (byId) return byId.id

  const bySlug = boards.find((board) => slugifyBoardName(board.name) === routeRef)
  return bySlug?.id ?? null
}

export function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
