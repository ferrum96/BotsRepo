export type { Board, Column, Epic, Task, Label, TaskLabel } from '@prisma/client'
import { Board, Column, Epic, Task, Label, TaskLabel } from '@prisma/client'

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
