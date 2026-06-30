import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateBoardInput } from '@/lib/types'

const DEFAULT_COLUMNS = [
  { title: 'BACKLOG', position: 0, color: '#6B7280' },
  { title: 'ГРУМИНГ', position: 1, color: '#EAB308' },
  { title: 'HOLD', position: 2, color: '#F97316' },
  { title: 'TO DO', position: 3, color: '#EF4444' },
  { title: 'IN PROGRESS', position: 4, color: '#3B82F6' },
  { title: 'IN REVIEW', position: 5, color: '#8B5CF6' },
  { title: 'DONE', position: 6, color: '#22C55E' },
]

export async function GET() {
  const boards = await prisma.board.findMany({
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(boards)
}

export async function POST(request: Request) {
  const body: CreateBoardInput = await request.json()

  if (!body.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const board = await prisma.board.create({
    data: {
      name: body.name,
      columns: {
        create: DEFAULT_COLUMNS,
      },
    },
    include: { columns: true },
  })

  return NextResponse.json(board, { status: 201 })
}
