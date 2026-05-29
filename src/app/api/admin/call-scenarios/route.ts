import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { callScenarios, analysisHeads, idQueryValue, idToString, isDuplicateKeyError, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scenariosCol = await callScenarios()
  const docs = await scenariosCol
    .aggregate([
      {
        $lookup: {
          from: 'analysis_heads',
          localField: 'analysis_head_id',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 0, name: 1 } }],
          as: 'analysis_head',
        },
      },
      { $unwind: { path: '$analysis_head', preserveNullAndEmptyArrays: true } },
      { $sort: { 'analysis_head.name': 1, name: 1 } },
    ])
    .toArray()

  return NextResponse.json(
    docs.map((d) => ({
      id: idToString(d._id),
      analysis_head_id: idToString(d.analysis_head_id),
      name: d.name,
      description: d.description ?? null,
      status: d.status,
      created_at: d.created_at,
      updated_at: d.updated_at,
      analysis_head: d.analysis_head ? { name: (d.analysis_head as { name: string }).name } : null,
    })),
  )
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.analysis_head_id) return NextResponse.json({ error: 'Analysis head is required' }, { status: 400 })
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const head = await (await analysisHeads()).findOne(
    { _id: idQueryValue(body.analysis_head_id) },
    { projection: { name: 1 } },
  )
  if (!head) return NextResponse.json({ error: 'Analysis head not found' }, { status: 400 })

  const col = await callScenarios()
  try {
    const oid = new ObjectId()
    await col.insertOne({
      _id: oid,
      analysis_head_id: head._id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      status: 'active',
      created_at: now(),
      updated_at: now(),
    })
    const doc = await col.findOne({ _id: oid })
    if (!doc) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
    return NextResponse.json(
      {
        id: idToString(doc._id),
        analysis_head_id: idToString(doc.analysis_head_id),
        name: doc.name,
        description: doc.description ?? null,
        status: doc.status,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        analysis_head: { name: head.name },
      },
      { status: 201 },
    )
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Scenario name already exists for this analysis head' }, { status: 409 })
    }
    throw e
  }
}
