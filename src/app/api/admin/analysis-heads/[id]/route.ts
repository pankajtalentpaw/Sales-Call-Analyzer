import { NextResponse, type NextRequest } from 'next/server'
import { analysisHeads, idQueryValue, idToString, isDuplicateKeyError, now } from '@/lib/db/collections'
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
  if (body.name !== undefined) $set.name = body.name.trim()
  if (body.description !== undefined) $set.description = body.description.trim() || null
  if (body.status !== undefined) $set.status = body.status

  const col = await analysisHeads()
  try {
    const result = await col.findOneAndUpdate({ _id: idQueryValue(id) }, { $set }, { returnDocument: 'after' })
    if (!result) return NextResponse.json({ error: 'Analysis head not found' }, { status: 404 })
    const { _id, ...rest } = result
    return NextResponse.json({ id: idToString(_id), ...rest })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Analysis head name already exists' }, { status: 409 })
    }
    throw e
  }
}
