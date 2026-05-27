import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (body.status && !['active', 'inactive'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (body.analysis_head_id) {
    const head = await prisma.analysisHead.findUnique({ where: { id: body.analysis_head_id } })
    if (!head) return NextResponse.json({ error: 'Analysis head not found' }, { status: 400 })
  }

  const data: Prisma.CallScenarioUpdateInput = {}
  if (body.analysis_head_id !== undefined) data.analysis_head = { connect: { id: body.analysis_head_id } }
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.description !== undefined) data.description = body.description.trim() || null
  if (body.status !== undefined) data.status = body.status

  try {
    const scenario = await prisma.callScenario.update({
      where: { id },
      data,
      include: { analysis_head: { select: { name: true } } },
    })
    return NextResponse.json(scenario)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })
      if (e.code === 'P2002') return NextResponse.json({ error: 'Scenario name already exists for this analysis head' }, { status: 409 })
    }
    throw e
  }
}
