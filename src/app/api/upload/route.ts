import { type NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { employees, analysisHeads, calls, uploadBatches, toOid, now } from '@/lib/db/collections'
import { uploadToStorage } from '@/lib/storage'
import { transcribeAudio } from '@/lib/assemblyai'
import { extractSpreadsheetText } from '@/lib/spreadsheet'

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
  'audio/ogg', 'application/octet-stream',
])
const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'mpeg', 'mpga', 'wav', 'm4a', 'aac', 'ogg'])
const ALLOWED_SHEET_EXTENSIONS = new Set(['xlsx', 'csv'])

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
    return NextResponse.json(
      { error: 'Missing required fields: employee_id, analysis_head_id, call_scenario_id, call_date' },
      { status: 400 },
    )
  }
  if (files.length === 0) return NextResponse.json({ error: 'No audio files provided' }, { status: 400 })
  if (files.length > 15) return NextResponse.json({ error: 'Maximum 15 files allowed per upload' }, { status: 400 })

  const invalidFiles = files.filter((f) => !isAllowedAudioFile(f))
  if (invalidFiles.length > 0) {
    return NextResponse.json({
      error: `Unsupported format: ${invalidFiles.map((f) => f.name).join(', ')}. Allowed: MP3, MPEG, WAV, M4A, AAC, OGG.`,
    }, { status: 400 })
  }
  if (sheet instanceof File && !isAllowedSheetFile(sheet)) {
    return NextResponse.json({ error: 'Only .xlsx and .csv sheet files are supported' }, { status: 400 })
  }

  const empOid = toOid(employeeId)
  const headOid = toOid(analysisHeadId)

  const [employee, analysisHead] = await Promise.all([
    (await employees()).findOne({ _id: empOid, status: 'active' }, { projection: { _id: 1, name: 1 } }),
    (await analysisHeads()).findOne({ _id: headOid, status: 'active' }, { projection: { _id: 1, name: 1 } }),
  ])

  if (!employee) return NextResponse.json({ error: 'Employee not found or inactive' }, { status: 400 })
  if (!analysisHead) return NextResponse.json({ error: 'Analysis head not found or inactive' }, { status: 400 })

  const batchDate = new Date(callDate)
  const dateStr = batchDate.toISOString().split('T')[0]
  const headSlug = analysisHead.name.toLowerCase().replace(/\s+/g, '-')
  const empSlug = employee.name.toLowerCase().replace(/\s+/g, '-')

  const batchId = new ObjectId()
  const batchesCol = await uploadBatches()
  await batchesCol.insertOne({
    _id: batchId,
    employee_id: empOid,
    analysis_head_id: headOid,
    call_scenario_id: toOid(callScenarioId),
    batch_date: batchDate,
    total_files: files.length,
    completed_files: 0,
    failed_files: 0,
    report_status: 'pending',
    notes: notes ?? null,
    created_at: now(),
    updated_at: now(),
  })

  if (sheet instanceof File && sheet.size > 0) {
    const ext = sheet.name.split('.').pop()?.toLowerCase() ?? 'xlsx'
    const buffer = Buffer.from(await sheet.arrayBuffer())
    const storageKey = `sheets/${batchId.toHexString()}/sheet.${ext}`
    const [sheetFileUrl, sheetText] = await Promise.all([
      uploadToStorage(storageKey, buffer, sheet.type || 'application/octet-stream'),
      extractSpreadsheetText(sheet.name, buffer),
    ])
    await batchesCol.updateOne(
      { _id: batchId },
      { $set: { sheet_file_name: sheet.name, sheet_file_url: sheetFileUrl, sheet_text: sheetText || null, updated_at: now() } },
    )
  }

  const callsCol = await calls()
  const queued: Array<{ callOid: ObjectId; buffer: Buffer; fileName: string; mimeType: string }> = []

  for (const file of files) {
    const callOid = new ObjectId()
    const ext = file.name.split('.').pop() ?? 'mp3'
    const storageKey = `audio/${headSlug}/${empSlug}/${dateStr}/${callOid.toHexString()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const audioUrl = await uploadToStorage(storageKey, buffer, file.type)

    await callsCol.insertOne({
      _id: callOid,
      employee_id: empOid,
      analysis_head_id: headOid,
      call_scenario_id: toOid(callScenarioId),
      upload_batch_id: batchId,
      call_datetime: batchDate,
      file_name: file.name,
      audio_url: audioUrl,
      transcription_status: 'pending',
      analysis_status: 'pending',
      notes: notes ?? null,
      created_at: now(),
      updated_at: now(),
    })

    queued.push({ callOid, buffer, fileName: file.name, mimeType: file.type })
  }

  for (const q of queued) {
    void runTranscription(q.callOid, batchId, q.buffer, q.fileName, q.mimeType)
  }

  return NextResponse.json({ success: true, batch_id: batchId.toHexString(), total_files: files.length })
}

async function runTranscription(callOid: ObjectId, batchId: ObjectId, buffer: Buffer, fileName: string, mimeType: string) {
  const callsCol = await calls()
  const batchesCol = await uploadBatches()

  try {
    await callsCol.updateOne(
      { _id: callOid },
      { $set: { transcription_status: 'processing', updated_at: now() } },
    )

    const { transcript, rawJson, durationSeconds, languageDetected, speakerCount } =
      await transcribeAudio(buffer, fileName, mimeType)

    const rawKey = `transcripts/raw/${callOid.toHexString()}.json`
    const rawTranscriptUrl = await uploadToStorage(rawKey, Buffer.from(rawJson), 'application/json')

    await callsCol.updateOne(
      { _id: callOid },
      {
        $set: {
          transcription_status: 'completed',
          transcript_text: transcript,
          raw_transcript_json_url: rawTranscriptUrl,
          duration_seconds: durationSeconds ?? null,
          language_detected: languageDetected ?? null,
          speaker_count: speakerCount ?? null,
          updated_at: now(),
        },
      },
    )

    await batchesCol.updateOne({ _id: batchId }, { $inc: { completed_files: 1 }, $set: { updated_at: now() } })
  } catch (err) {
    console.error(`Transcription failed for call ${callOid.toHexString()}:`, err)
    await callsCol
      .updateOne(
        { _id: callOid },
        {
          $set: {
            transcription_status: 'failed',
            analysis_status: 'failed',
            analysis_error: 'Transcription failed before analysis',
            updated_at: now(),
          },
        },
      )
      .catch(() => {})
    await batchesCol
      .updateOne({ _id: batchId }, { $inc: { failed_files: 1 }, $set: { updated_at: now() } })
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
