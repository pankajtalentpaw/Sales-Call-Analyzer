import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { masterFiles, analysisHeads, toOid, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'
import { uploadToStorage } from '@/lib/storage'
import mammoth from 'mammoth'

export async function GET(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const col = await masterFiles()
  const docs = await col
    .aggregate([
      { $sort: { created_at: -1 } },
      {
        $lookup: {
          from: 'analysis_heads',
          localField: 'analysis_head_id',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 0, name: 1 } }],
          as: 'analysis_head',
        },
      },
      {
        $unwind: { path: '$analysis_head', preserveNullAndEmptyArrays: true },
      },
    ])
    .toArray()

  return NextResponse.json(
    docs.map((d) => ({
      id: (d._id as ObjectId).toHexString(),
      title: d.title,
      version: d.version,
      scope: d.scope,
      analysis_head_id: d.analysis_head_id ? (d.analysis_head_id as ObjectId).toHexString() : null,
      file_url: d.file_url,
      extracted_text: d.extracted_text ?? null,
      is_active: d.is_active,
      created_at: d.created_at,
      updated_at: d.updated_at,
      analysis_head: d.analysis_head ? { name: (d.analysis_head as { name: string }).name } : null,
    })),
  )
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await request.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const title = (formData.get('title') as string | null)?.trim()
  const version = (formData.get('version') as string | null)?.trim()
  const scope = formData.get('scope') as string | null
  const analysisHeadId = formData.get('analysis_head_id') as string | null
  const file = formData.get('file')

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!version) return NextResponse.json({ error: 'Version is required' }, { status: 400 })
  if (scope !== 'global' && scope !== 'head-specific') {
    return NextResponse.json({ error: 'Scope must be global or head-specific' }, { status: 400 })
  }
  if (scope === 'head-specific' && !analysisHeadId) {
    return NextResponse.json({ error: 'Analysis head is required for head-specific scope' }, { status: 400 })
  }
  if (!(file instanceof File)) return NextResponse.json({ error: 'File is required' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'txt' && ext !== 'docx') {
    return NextResponse.json({ error: 'Only .txt and .docx files are supported' }, { status: 400 })
  }

  let headOid: ObjectId | null = null
  if (scope === 'head-specific' && analysisHeadId) {
    try { headOid = toOid(analysisHeadId) } catch {
      return NextResponse.json({ error: 'Invalid analysis head' }, { status: 400 })
    }
  }

  const col = await masterFiles()
  const oid = new ObjectId()

  await col.insertOne({
    _id: oid,
    title,
    version,
    scope,
    analysis_head_id: headOid,
    file_url: '',
    extracted_text: null,
    is_active: false,
    created_at: now(),
    updated_at: now(),
  })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType = ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/plain'
    const storageKey = `master-files/${oid.toHexString()}/file.${ext}`

    const file_url = await uploadToStorage(storageKey, buffer, contentType)
    const extracted_text = ext === 'txt'
      ? buffer.toString('utf-8')
      : (await mammoth.extractRawText({ buffer })).value

    await col.updateOne({ _id: oid }, { $set: { file_url, extracted_text, updated_at: now() } })

    const headDoc = headOid
      ? await (await analysisHeads()).findOne({ _id: headOid }, { projection: { name: 1 } })
      : null

    return NextResponse.json(
      {
        id: oid.toHexString(),
        title,
        version,
        scope,
        analysis_head_id: headOid?.toHexString() ?? null,
        file_url,
        extracted_text,
        is_active: false,
        analysis_head: headDoc ? { name: headDoc.name } : null,
      },
      { status: 201 },
    )
  } catch (err) {
    await col.deleteOne({ _id: oid }).catch(() => {})
    console.error('Master file upload failed:', err)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
