import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { uploadBatches, calls, toOid, now } from '@/lib/db/collections'
import { getDb } from '@/lib/mongodb'
import { generateBatchReport } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { runCallAnalysis } from '@/lib/call-analysis'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let oid: ObjectId
  try { oid = toOid(id) } catch {
    return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })
  }

  const batch = await getBatch(oid)
  if (!batch) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })

  const batchesCol = await uploadBatches()
  const completedTranscripts = batch.calls.filter((c) => c.transcription_status === 'completed').length
  const failedTranscripts = batch.calls.filter((c) => c.transcription_status === 'failed').length

  if (failedTranscripts > 0) {
    const message = `Transcription failed for ${failedTranscripts} file(s). Report can be generated after fixing or re-uploading those files.`
    await batchesCol.updateOne({ _id: oid }, { $set: { report_status: 'failed', report_error: message, updated_at: now() } })
    return NextResponse.json({
      error: message, report_status: 'failed',
      completed_transcripts: completedTranscripts, failed_transcripts: failedTranscripts,
      total_files: batch.calls.length,
    }, { status: 409 })
  }

  if (completedTranscripts < batch.calls.length) {
    const message = `Transcription is still processing (${completedTranscripts}/${batch.calls.length} completed)`
    await batchesCol.updateOne({ _id: oid }, { $set: { report_status: 'waiting_transcripts', report_error: message, updated_at: now() } })
    return NextResponse.json({
      error: message, report_status: 'waiting_transcripts',
      completed_transcripts: completedTranscripts, total_files: batch.calls.length,
    }, { status: 409 })
  }

  try {
    await batchesCol.updateOne({ _id: oid }, { $set: { report_status: 'processing', report_error: null, updated_at: now() } })

    for (const call of batch.calls) {
      if (call.analysis_status !== 'completed') {
        await runCallAnalysis(call._id.toHexString(), batch.sheet_text)
      }
    }

    const refreshed = await getBatch(oid)
    if (!refreshed) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })

    const { reportText } = await generateBatchReport({
      sheetText: refreshed.sheet_text,
      metadata: {
        employeeName: refreshed.employee?.display_name || refreshed.employee?.name || 'Unknown',
        analysisHead: refreshed.analysis_head?.name || 'Unknown',
        callScenario: refreshed.call_scenario?.name || 'Unknown',
        callDate: refreshed.batch_date.toISOString().split('T')[0],
        totalFiles: refreshed.total_files,
        notes: refreshed.notes,
      },
      calls: refreshed.calls.map((c) => ({
        fileName: c.file_name,
        transcript: c.transcript_text ?? '',
        analysisText: c.analysis_text ?? null,
      })),
    })

    const reportUrl = await uploadToStorage(
      `reports/${id}/analysis-report.md`,
      Buffer.from(reportText),
      'text/markdown',
    )

    await batchesCol.updateOne(
      { _id: oid },
      {
        $set: {
          report_status: 'completed',
          report_text: reportText,
          report_file_url: reportUrl,
          report_error: null,
          report_generated_at: now(),
          updated_at: now(),
        },
      },
    )

    return NextResponse.json({
      ok: true, report_status: 'completed',
      report_file_url: reportUrl,
      report_dashboard_url: `/reports/${id}`,
      report_pdf_url: `/api/upload-batches/${id}/report-pdf`,
      report_text: reportText,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Report generation failed'
    await batchesCol
      .updateOne({ _id: oid }, { $set: { report_status: 'failed', report_error: message, updated_at: now() } })
      .catch(() => {})
    return NextResponse.json({ error: message, report_status: 'failed' }, { status: 500 })
  }
}

async function getBatch(oid: ObjectId) {
  const batch = await (await uploadBatches()).findOne({ _id: oid })
  if (!batch) return null

  const db = await getDb()
  const [employee, analysisHead, callScenario, batchCalls] = await Promise.all([
    db.collection('employees').findOne({ _id: batch.employee_id }, { projection: { display_name: 1, name: 1 } }),
    db.collection('analysis_heads').findOne({ _id: batch.analysis_head_id }, { projection: { name: 1 } }),
    db.collection('call_scenarios').findOne({ _id: batch.call_scenario_id }, { projection: { name: 1 } }),
    (await calls()).find({ upload_batch_id: oid }).sort({ created_at: 1 }).toArray(),
  ])

  return {
    ...batch,
    employee: employee as { display_name?: string; name?: string } | null,
    analysis_head: analysisHead as { name?: string } | null,
    call_scenario: callScenario as { name?: string } | null,
    calls: batchCalls,
  }
}
