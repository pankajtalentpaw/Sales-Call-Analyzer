import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { uploadBatches, calls, toOid } from '@/lib/db/collections'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let oid: ObjectId
  try { oid = toOid(id) } catch {
    return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })
  }

  const batch = await (await uploadBatches()).findOne({ _id: oid })
  if (!batch) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })

  const batchCalls = await (await calls())
    .find({ upload_batch_id: oid }, { projection: { transcription_status: 1, analysis_status: 1 } })
    .toArray()

  const batchIdStr = batch._id.toHexString()

  return NextResponse.json({
    id: batchIdStr,
    total_files: batch.total_files,
    completed_files: batch.completed_files,
    failed_files: batch.failed_files,
    transcription: countStatuses(batchCalls.map((c) => c.transcription_status)),
    analysis: countStatuses(batchCalls.map((c) => c.analysis_status)),
    report_status: batch.report_status,
    report_file_url: batch.report_file_url ?? null,
    report_dashboard_url: batch.report_status === 'completed' ? `/reports/${batchIdStr}` : null,
    report_pdf_url: batch.report_status === 'completed' ? `/api/upload-batches/${batchIdStr}/report-pdf` : null,
    report_error: batch.report_error ?? null,
  })
}

function countStatuses(statuses: (string | undefined)[]) {
  return statuses.reduce<Record<string, number>>((acc, status) => {
    if (status) acc[status] = (acc[status] ?? 0) + 1
    return acc
  }, {})
}
