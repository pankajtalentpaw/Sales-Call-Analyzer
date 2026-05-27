import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToStorage } from '@/lib/storage'
import { transcribeAudio } from '@/lib/assemblyai'
import { extractSpreadsheetText } from '@/lib/spreadsheet'

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/ogg',
  'application/octet-stream',
])
const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'mpeg', 'mpga', 'wav', 'm4a', 'aac', 'ogg'])
const ALLOWED_SHEET_EXTENSIONS = new Set(['xlsx', 'csv'])

type PrismaData = Record<string, unknown>

const callUpdateData = (data: PrismaData) =>
  data as Parameters<typeof prisma.call.update>[0]['data']

const batchUpdateData = (data: PrismaData) =>
  data as Parameters<typeof prisma.uploadBatch.update>[0]['data']

export async function POST(request: NextRequest) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const employeeId = formData.get('employee_id') as string | null
  const analysisHeadId = formData.get('analysis_head_id') as string | null
  const callScenarioId = formData.get('call_scenario_id') as string | null
  const callDate = formData.get('call_date') as string | null
  const notes = formData.get('notes') as string | null
  const files = formData.getAll('files').filter((v): v is File => v instanceof File)
  const sheet = formData.get('report_sheet')

  if (!employeeId || !analysisHeadId || !callScenarioId || !callDate) {
    return NextResponse.json({ error: 'Missing required fields: employee_id, analysis_head_id, call_scenario_id, call_date' }, { status: 400 })
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No audio files provided' }, { status: 400 })
  }

  if (files.length > 15) {
    return NextResponse.json({ error: 'Maximum 15 files allowed per upload' }, { status: 400 })
  }

  const invalidFiles = files.filter((f) => !isAllowedAudioFile(f))
  if (invalidFiles.length > 0) {
    return NextResponse.json({
      error: `Unsupported format: ${invalidFiles.map((f) => f.name).join(', ')}. Allowed: MP3, MPEG, WAV, M4A, AAC, OGG.`,
    }, { status: 400 })
  }

  if (sheet instanceof File && !isAllowedSheetFile(sheet)) {
    return NextResponse.json({ error: 'Only .xlsx and .csv sheet files are supported' }, { status: 400 })
  }

  const [employee, analysisHead] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId, status: 'active' }, select: { id: true, name: true } }),
    prisma.analysisHead.findUnique({ where: { id: analysisHeadId, status: 'active' }, select: { id: true, name: true } }),
  ])

  if (!employee) return NextResponse.json({ error: 'Employee not found or inactive' }, { status: 400 })
  if (!analysisHead) return NextResponse.json({ error: 'Analysis head not found or inactive' }, { status: 400 })

  const batchDate = new Date(callDate)
  const dateStr = batchDate.toISOString().split('T')[0]
  const headSlug = analysisHead.name.toLowerCase().replace(/\s+/g, '-')
  const empSlug = employee.name.toLowerCase().replace(/\s+/g, '-')

  const batch = await prisma.uploadBatch.create({
    data: {
      employee_id: employeeId,
      analysis_head_id: analysisHeadId,
      call_scenario_id: callScenarioId,
      batch_date: batchDate,
      total_files: files.length,
      notes: notes ?? undefined,
    },
  })

  if (sheet instanceof File && sheet.size > 0) {
    const ext = sheet.name.split('.').pop()?.toLowerCase() ?? 'xlsx'
    const buffer = Buffer.from(await sheet.arrayBuffer())
    const storageKey = `sheets/${batch.id}/sheet.${ext}`
    const [sheetFileUrl, sheetText] = await Promise.all([
      uploadToStorage(storageKey, buffer, sheet.type || 'application/octet-stream'),
      extractSpreadsheetText(sheet.name, buffer),
    ])

    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: batchUpdateData({
        sheet_file_name: sheet.name,
        sheet_file_url: sheetFileUrl,
        sheet_text: sheetText || null,
      }),
    })
  }

  // Upload each file to storage and create a call record
  const queued: Array<{ callId: string; buffer: Buffer; fileName: string; mimeType: string }> = []

  for (const file of files) {
    const callId = crypto.randomUUID()
    const ext = file.name.split('.').pop() ?? 'mp3'
    const storageKey = `audio/${headSlug}/${empSlug}/${dateStr}/${callId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const audioUrl = await uploadToStorage(storageKey, buffer, file.type)

    await prisma.call.create({
      data: {
        id: callId,
        employee_id: employeeId,
        analysis_head_id: analysisHeadId,
        call_scenario_id: callScenarioId,
        call_datetime: batchDate,
        file_name: file.name,
        audio_url: audioUrl,
        transcription_status: 'pending',
        notes: notes ?? undefined,
        upload_batch_id: batch.id,
      },
    })

    queued.push({ callId, buffer, fileName: file.name, mimeType: file.type })
  }

  // Fire-and-forget transcription.
  // On traditional Node.js servers these run in the background after the response is sent.
  // On serverless platforms (Vercel), use a job queue for reliable execution.
  for (const q of queued) {
    void runTranscription(q.callId, batch.id, q.buffer, q.fileName, q.mimeType)
  }

  return NextResponse.json({ success: true, batch_id: batch.id, total_files: files.length })
}

async function runTranscription(
  callId: string,
  batchId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
) {
  try {
    await prisma.call.update({ where: { id: callId }, data: { transcription_status: 'processing' } })

    const { transcript, rawJson, durationSeconds, languageDetected, speakerCount } =
      await transcribeAudio(buffer, fileName, mimeType)

    const rawKey = `transcripts/raw/${callId}.json`
    const rawTranscriptUrl = await uploadToStorage(rawKey, Buffer.from(rawJson), 'application/json')

    await prisma.call.update({
      where: { id: callId },
      data: {
        transcription_status: 'completed',
        transcript_text: transcript,
        raw_transcript_json_url: rawTranscriptUrl,
        duration_seconds: durationSeconds ?? undefined,
        language_detected: languageDetected ?? undefined,
        speaker_count: speakerCount ?? undefined,
      },
    })

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: { completed_files: { increment: 1 } },
    })

  } catch (err) {
    console.error(`Transcription failed for call ${callId}:`, err)
    await prisma.call
      .update({
        where: { id: callId },
        data: callUpdateData({
          transcription_status: 'failed',
          analysis_status: 'failed',
          analysis_error: 'Transcription failed before analysis',
        }),
      })
      .catch(() => {})
    await prisma.uploadBatch
      .update({ where: { id: batchId }, data: { failed_files: { increment: 1 } } })
      .catch(() => {})
  }
}

function isAllowedAudioFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_AUDIO_EXTENSIONS.has(extension) || ALLOWED_AUDIO_MIME_TYPES.has(file.type)
}

function isAllowedSheetFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_SHEET_EXTENSIONS.has(extension)
}
