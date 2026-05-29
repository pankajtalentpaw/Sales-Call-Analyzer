import { NextResponse, type NextRequest } from 'next/server'
import { callScenarios, analysisHeads, toOid, isDuplicateKeyError, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (body.status && !['active', 'inactive'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const $set: Record<string, unknown> = { updated_at: now() }

  if (body.analysis_head_id !== undefined) {
    try {
      const headOid = toOid(body.analysis_head_id)
      const head = await (await analysisHeads()).findOne({ _id: headOid })
      if (!head) return NextResponse.json({ error: 'Analysis head not found' }, { status: 400 })
      $set.analysis_head_id = headOid
    } catch {
      return NextResponse.json({ error: 'Analysis head not found' }, { status: 400 })
    }
  }

  if (body.name !== undefined) $set.name = body.name.trim()
  if (body.description !== undefined) $set.description = body.description.trim() || null
  if (body.status !== undefined) $set.status = body.status

  let oid
  try { oid = toOid(id) } catch {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })
  }

  const col = await callScenarios()
  try {
    const result = await col.findOneAndUpdate({ _id: oid }, { $set }, { returnDocument: 'after' })
    if (!result) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })

    const headDoc = await (await analysisHeads()).findOne(
      { _id: result.analysis_head_id },
      { projection: { name: 1 } },
    )

    return NextResponse.json({
      id: result._id.toHexString(),
      analysis_head_id: result.analysis_head_id.toHexString(),
      name: result.name,
      description: result.description ?? null,
      status: result.status,
      created_at: result.created_at,
      updated_at: result.updated_at,
      analysis_head: headDoc ? { name: headDoc.name } : null,
    })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Scenario name already exists for this analysis head' }, { status: 409 })
    }
    throw e
  }
}
