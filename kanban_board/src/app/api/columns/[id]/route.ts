import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const column = await prisma.column.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.wipLimit !== undefined && { wipLimit: body.wipLimit }),
    },
  })

  return NextResponse.json(column)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.column.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
