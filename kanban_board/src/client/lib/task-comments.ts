export type TaskComment = {
  id: string
  body: string
  author: string
  createdAt: string
  updatedAt?: string
}

export function addTaskComment(
  comments: TaskComment[],
  input: { id: string; body: string; author: string; createdAt?: string }
): TaskComment[] | null {
  const body = input.body.trim()
  if (!body) return null

  const next: TaskComment = {
    id: input.id,
    body,
    author: input.author.trim() || 'You',
    createdAt: input.createdAt ?? new Date().toISOString(),
  }

  return [next, ...comments]
}

export function updateTaskComment(
  comments: TaskComment[],
  commentId: string,
  body: string,
  updatedAt = new Date().toISOString()
): TaskComment[] | null {
  const nextBody = body.trim()
  if (!nextBody) return null
  if (!comments.some((comment) => comment.id === commentId)) return null

  return comments.map((comment) =>
    comment.id === commentId
      ? { ...comment, body: nextBody, updatedAt }
      : comment
  )
}

export function deleteTaskComment(comments: TaskComment[], commentId: string): TaskComment[] {
  return comments.filter((comment) => comment.id !== commentId)
}
