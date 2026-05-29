import { NextResponse, type NextRequest } from 'next/server'
import { masterFiles, analysisHeads, idQueryValue, idToString, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: { is_active?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const col = await masterFiles()
  const target = await col.findOne({ _id: idQueryValue(id) })
  if (!target) return NextResponse.json({ error: 'Master file not found' }, { status: 404 })

  if (body.is_active === true) {
    const deactivateFilter: Record<string, unknown> = {
      _id: { $ne: target._id },
      scope: target.scope,
      is_active: true,
    }
    if (target.scope === 'head-specific' && target.analysis_head_id) {
      deactivateFilter.analysis_head_id = target.analysis_head_id
    }
    await col.updateMany(deactivateFilter, { $set: { is_active: false, updated_at: now() } })
    await col.updateOne({ _id: target._id }, { $set: { is_active: true, updated_at: now() } })
  } else if (body.is_active === false) {
    await col.updateOne({ _id: target._id }, { $set: { is_active: false, updated_at: now() } })
  } else {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await col.findOne({ _id: target._id })
  if (!updated) return NextResponse.json({ error: 'Master file not found' }, { status: 404 })

  const headDoc = updated.analysis_head_id
    ? await (await analysisHeads()).findOne({ _id: updated.analysis_head_id }, { projection: { name: 1 } })
    : null

  return NextResponse.json({
    id: idToString(updated._id),
    title: updated.title,
    version: updated.version,
    scope: updated.scope,
    analysis_head_id: updated.analysis_head_id ? idToString(updated.analysis_head_id) : null,
    file_url: updated.file_url,
    extracted_text: updated.extracted_text ?? null,
    is_active: updated.is_active,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
    analysis_head: headDoc ? { name: headDoc.name } : null,
  })
}
