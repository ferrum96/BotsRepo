export type TaskDetailsUpdatePayload = {
  title?: string
  description?: string
  columnId?: string
  epicId?: string | null
  priority?: string
  assignee?: string | null
  estimatedTime?: string | null
  meta?: string
}

/** Meta-only updates should not trigger a board reload. */
export function shouldSkipBoardRefetch(data: TaskDetailsUpdatePayload) {
  const keys = Object.keys(data)
  return keys.length === 1 && keys[0] === 'meta'
}

/**
 * Task-details field updates must refresh the board silently,
 * otherwise the page remounts and local drafts are lost.
 */
export function shouldSilentBoardRefetch(data: TaskDetailsUpdatePayload) {
  return !shouldSkipBoardRefetch(data)
}

export function resolveDraftAfterTaskSync<T>(options: {
  isEditing: boolean
  localValue: T
  serverValue: T
}) {
  return options.isEditing ? options.localValue : options.serverValue
}

export function shouldKeepDescriptionEditorOpen(isEditingDescription: boolean) {
  return isEditingDescription
}
