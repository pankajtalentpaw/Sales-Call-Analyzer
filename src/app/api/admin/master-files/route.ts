import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { uploadToStorage } from '@/lib/storage'
import mammoth from 'mammoth'

export async function GET(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const files = await prisma.masterFile.findMany({
    include: { analysis_head: { select: { name: true } } },
    orderBy: { created_at: 'desc' },
  })
  return NextResponse.json(files)
}

export async function POST(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // Create DB record first to get the ID for the storage key
  const record = await prisma.masterFile.create({
    data: {
      title,
      version,
      scope,
      analysis_head_id: scope === 'head-specific' ? analysisHeadId : null,
      file_url: '',
      is_active: false,
    },
  })

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType = ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/plain'
    const storageKey = `master-files/${record.id}/file.${ext}`

    const file_url = await uploadToStorage(storageKey, buffer, contentType)

    const extracted_text = ext === 'txt'
      ? buffer.toString('utf-8')
      : (await mammoth.extractRawText({ buffer })).value

    const updated = await prisma.masterFile.update({
      where: { id: record.id },
      data: { file_url, extracted_text },
      include: { analysis_head: { select: { name: true } } },
    })

    return NextResponse.json(updated, { status: 201 })
  } catch (err) {
    await prisma.masterFile.delete({ where: { id: record.id } }).catch(() => {})
    console.error('Master file upload failed:', err)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
