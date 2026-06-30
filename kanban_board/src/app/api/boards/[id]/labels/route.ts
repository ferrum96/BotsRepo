import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateLabelInput } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const labels = await prisma.label.findMany({
    where: { boardId: id },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(labels)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: CreateLabelInput = await request.json()

  if (!body.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  try {
    const label = await prisma.label.create({
      data: {
        boardId: id,
        name: body.name,
        color: body.color || '#6B7280',
      },
    })

    return NextResponse.json(label, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create label' }, { status: 500 })
  }
}
