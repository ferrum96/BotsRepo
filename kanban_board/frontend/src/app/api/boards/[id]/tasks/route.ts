import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Priority } from '@prisma/client'
import { CreateTaskInput, TaskFilters } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)

  const filters: TaskFilters = {
    epicId: searchParams.get('epicId') || undefined,
    assignee: searchParams.get('assignee') || undefined,
    epicsOnly: searchParams.get('epicsOnly') === 'true',
    noAssignee: searchParams.get('noAssignee') === 'true',
  }

  const where: any = { boardId: id }

  if (filters.epicId) where.epicId = filters.epicId
  if (filters.assignee) where.assignee = filters.assignee
  if (filters.noAssignee) where.assignee = null
  if (filters.epicsOnly) where.epicId = { not: null }

  try {
    const tasks = await prisma.task.findMany({
      where,
      include: {
        epic: true,
        labels: { include: { label: true } },
        column: true,
      },
      orderBy: { position: 'asc' },
    })

    return NextResponse.json(tasks)
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: CreateTaskInput = await request.json()

  if (!body.title || !body.columnId) {
    return NextResponse.json({ error: 'Title and columnId are required' }, { status: 400 })
  }

  try {
    const lastTask = await prisma.task.findFirst({
      where: { boardId: id },
      orderBy: { taskNumber: 'desc' },
    })

    const maxPosition = await prisma.task.aggregate({
      where: { columnId: body.columnId },
      _max: { position: true },
    })

    const task = await prisma.task.create({
      data: {
        boardId: id,
        taskNumber: (lastTask?.taskNumber ?? 0) + 1,
        columnId: body.columnId,
        title: body.title,
        description: body.description,
        epicId: body.epicId,
        priority: (body.priority as Priority) || Priority.MEDIUM,
        assignee: body.assignee,
        estimatedTime: body.estimatedTime,
        position: (maxPosition._max.position ?? -1) + 1,
        labels: body.labelIds?.length
          ? {
              create: body.labelIds.map((labelId) => ({
                labelId,
              })),
            }
          : undefined,
      },
      include: {
        epic: true,
        labels: { include: { label: true } },
      },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
