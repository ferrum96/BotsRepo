import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateEpicInput } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const epics = await prisma.epic.findMany({
    where: { boardId: id },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(epics)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: CreateEpicInput = await request.json()

  if (!body.title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  try {
    const epic = await prisma.epic.create({
      data: {
        boardId: id,
        title: body.title,
        description: body.description,
        color: body.color || '#3B82F6',
      },
    })

    return NextResponse.json(epic, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create epic' }, { status: 500 })
  }
}
