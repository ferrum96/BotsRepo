import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (!body.title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const maxPosition = await prisma.column.aggregate({
    where: { boardId: id },
    _max: { position: true },
  })

  const column = await prisma.column.create({
    data: {
      boardId: id,
      title: body.title,
      position: (maxPosition._max.position ?? -1) + 1,
      color: body.color || '#6B7280',
      wipLimit: body.wipLimit,
    },
  })

  return NextResponse.json(column, { status: 201 })
}
