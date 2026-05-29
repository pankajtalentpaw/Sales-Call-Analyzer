import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { analysisHeads, idToString, isDuplicateKeyError, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const col = await analysisHeads()
  const docs = await col.find({}).sort({ name: 1 }).toArray()
  return NextResponse.json(docs.map(({ _id, ...rest }) => ({ id: idToString(_id), ...rest })))
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const col = await analysisHeads()
  try {
    const oid = new ObjectId()
    await col.insertOne({
      _id: oid,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      status: 'active',
      created_at: now(),
      updated_at: now(),
    })
    const doc = await col.findOne({ _id: oid })
    if (!doc) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
    const { _id, ...rest } = doc
    return NextResponse.json({ id: idToString(_id), ...rest }, { status: 201 })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Analysis head name already exists' }, { status: 409 })
    }
    throw e
  }
}
