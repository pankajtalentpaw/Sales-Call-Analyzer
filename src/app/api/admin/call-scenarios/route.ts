import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scenarios = await prisma.callScenario.findMany({
    include: { analysis_head: { select: { name: true } } },
    orderBy: [{ analysis_head: { name: 'asc' } }, { name: 'asc' }],
  })
  return NextResponse.json(scenarios)
}

export async function POST(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.analysis_head_id) return NextResponse.json({ error: 'Analysis head is required' }, { status: 400 })
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const head = await prisma.analysisHead.findUnique({ where: { id: body.analysis_head_id } })
  if (!head) return NextResponse.json({ error: 'Analysis head not found' }, { status: 400 })

  try {
    const scenario = await prisma.callScenario.create({
      data: {
        analysis_head_id: body.analysis_head_id,
        name: body.name.trim(),
        description: body.description?.trim() || undefined,
      },
      include: { analysis_head: { select: { name: true } } },
    })
    return NextResponse.json(scenario, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Scenario name already exists for this analysis head' }, { status: 409 })
    }
    throw e
  }
}
