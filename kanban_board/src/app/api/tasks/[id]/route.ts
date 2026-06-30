import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Priority } from '@prisma/client'
import { UpdateTaskInput } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      epic: true,
      labels: { include: { label: true } },
      column: true,
    },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  return NextResponse.json(task)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: UpdateTaskInput = await request.json()

  const { labelIds, ...data } = body

  try {
    const { columnId, ...scalarData } = data
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          ...scalarData,
          priority: scalarData.priority as Priority | undefined,
          ...(columnId !== undefined && { columnId }),
        },
      })

      if (labelIds) {
        await tx.taskLabel.deleteMany({
          where: { taskId: id },
        })
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({
            taskId: id,
            labelId,
          })),
        })
      }
    })

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        epic: true,
        labels: { include: { label: true } },
      },
    })

    return NextResponse.json(task)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    throw error
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.task.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    throw error
  }
}
