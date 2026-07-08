export type Board = {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export type Column = {
  id: string
  boardId: string
  title: string
  position: number
  wipLimit: number | null
  color: string
}

export type Epic = {
  id: string
  boardId: string
  title: string
  description: string | null
  color: string
  createdAt: Date
}

export type Task = {
  id: string
  taskNumber: number
  boardId: string
  columnId: string
  epicId: string | null
  title: string
  description: string | null
  priority: string
  assignee: string | null
  estimatedTime: string | null
  position: number
  createdAt: Date
  updatedAt: Date
}

export type Label = {
  id: string
  boardId: string
  name: string
  color: string
}

export type TaskLabel = {
  taskId: string
  labelId: string
}

export type BoardWithColumns = Board & {
  columns: Column[]
}

export type BoardWithDetails = Board & {
  columns: (Column & {
    tasks: TaskWithDetails[]
  })[]
  epics: Epic[]
  labels: Label[]
}

export type TaskWithDetails = Task & {
  epic: Epic | null
  labels: (TaskLabel & {
    label: Label
  })[]
}

export type EpicWithTasks = Epic & {
  tasks: Task[]
}

export type CreateTaskInput = {
  title: string
  description?: string
  columnId: string
  epicId?: string
  priority?: string
  assignee?: string
  estimatedTime?: string
  labelIds?: string[]
}

export type UpdateTaskInput = Partial<CreateTaskInput>

export type MoveTaskInput = {
  columnId: string
  position: number
}

export type CreateBoardInput = {
  name: string
}

export type CreateEpicInput = {
  title: string
  description?: string
  color?: string
}

export type CreateLabelInput = {
  name: string
  color?: string
}

export type TaskFilters = {
  epicId?: string
  assignee?: string
  epicsOnly?: boolean
  noAssignee?: boolean
}
