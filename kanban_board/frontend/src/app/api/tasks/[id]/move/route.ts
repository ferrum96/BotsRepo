import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MoveTaskInput } from '@/lib/types'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: MoveTaskInput = await request.json()

  const task = await prisma.task.findUnique({
    where: { id },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: {
          columnId: task.columnId,
          position: { gt: task.position },
        },
        data: {
          position: { decrement: 1 },
        },
      })

      await tx.task.updateMany({
        where: {
          columnId: body.columnId,
          position: { gte: body.position },
        },
        data: {
          position: { increment: 1 },
        },
      })

      await tx.task.update({
        where: { id },
        data: {
          columnId: body.columnId,
          position: body.position,
        },
      })
    })

    const updatedTask = await prisma.task.findUnique({
      where: { id },
      include: {
        epic: true,
        labels: { include: { label: true } },
      },
    })

    return NextResponse.json(updatedTask)
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to move task' }, { status: 500 })
  }
}
