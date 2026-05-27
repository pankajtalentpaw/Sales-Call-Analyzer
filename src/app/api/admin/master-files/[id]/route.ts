import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: { is_active?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const target = await prisma.masterFile.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'Master file not found' }, { status: 404 })

  if (body.is_active === true) {
    // Deactivate all other files in the same scope, then activate this one
    await prisma.masterFile.updateMany({
      where: {
        id: { not: id },
        scope: target.scope,
        ...(target.scope === 'head-specific' ? { analysis_head_id: target.analysis_head_id } : {}),
        is_active: true,
      },
      data: { is_active: false },
    })
    const updated = await prisma.masterFile.update({
      where: { id },
      data: { is_active: true },
      include: { analysis_head: { select: { name: true } } },
    })
    return NextResponse.json(updated)
  }

  // Allow deactivating
  if (body.is_active === false) {
    const updated = await prisma.masterFile.update({
      where: { id },
      data: { is_active: false },
      include: { analysis_head: { select: { name: true } } },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}
