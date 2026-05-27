import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const heads = await prisma.analysisHead.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(heads)
}

export async function POST(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  try {
    const head = await prisma.analysisHead.create({
      data: { name: body.name.trim(), description: body.description?.trim() || undefined },
    })
    return NextResponse.json(head, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Analysis head name already exists' }, { status: 409 })
    }
    throw e
  }
}
