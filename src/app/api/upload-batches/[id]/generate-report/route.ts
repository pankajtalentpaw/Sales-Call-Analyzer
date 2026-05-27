import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateBatchReport } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { runCallAnalysis } from '@/lib/call-analysis'

type PrismaData = Record<string, unknown>

const batchUpdateData = (data: PrismaData) =>
  data as Parameters<typeof prisma.uploadBatch.update>[0]['data']

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await getBatch(id)

  if (!batch) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })

  const completedTranscripts = batch.calls.filter((call) => call.transcription_status === 'completed').length
  const failedTranscripts = batch.calls.filter((call) => call.transcription_status === 'failed').length

  if (failedTranscripts > 0) {
    const message = `Transcription failed for ${failedTranscripts} file(s). Report can be generated after fixing or re-uploading those files.`
    await prisma.uploadBatch.update({
      where: { id },
      data: batchUpdateData({ report_status: 'failed', report_error: message }),
    })

    return NextResponse.json({
      error: message,
      report_status: 'failed',
      completed_transcripts: completedTranscripts,
      failed_transcripts: failedTranscripts,
      total_files: batch.calls.length,
    }, { status: 409 })
  }

  if (completedTranscripts < batch.calls.length) {
    const message = `Transcription is still processing (${completedTranscripts}/${batch.calls.length} completed)`
    await prisma.uploadBatch.update({
      where: { id },
      data: batchUpdateData({ report_status: 'waiting_transcripts', report_error: message }),
    })

    return NextResponse.json({
      error: message,
      report_status: 'waiting_transcripts',
      completed_transcripts: completedTranscripts,
      total_files: batch.calls.length,
    }, { status: 409 })
  }

  try {
    await prisma.uploadBatch.update({
      where: { id },
      data: batchUpdateData({ report_status: 'processing', report_error: null }),
    })

    for (const call of batch.calls) {
      if (call.analysis_status !== 'completed') {
        await runCallAnalysis(call.id, batch.sheet_text)
      }
    }

    const refreshed = await getBatch(id)
    if (!refreshed) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })

    const { reportText } = await generateBatchReport({
      sheetText: refreshed.sheet_text,
      metadata: {
        employeeName: refreshed.employee.display_name || refreshed.employee.name,
        analysisHead: refreshed.analysis_head.name,
        callScenario: refreshed.call_scenario.name,
        callDate: refreshed.batch_date.toISOString().split('T')[0],
        totalFiles: refreshed.total_files,
        notes: refreshed.notes,
      },
      calls: refreshed.calls.map((call) => ({
        fileName: call.file_name,
        transcript: call.transcript_text ?? '',
        analysisText: call.analysis_text,
      })),
    })

    const reportUrl = await uploadToStorage(
      `reports/${id}/analysis-report.md`,
      Buffer.from(reportText),
      'text/markdown',
    )

    await prisma.uploadBatch.update({
      where: { id },
      data: batchUpdateData({
        report_status: 'completed',
        report_text: reportText,
        report_file_url: reportUrl,
        report_error: null,
        report_generated_at: new Date(),
      }),
    })

    return NextResponse.json({
      ok: true,
      report_status: 'completed',
      report_file_url: reportUrl,
      report_dashboard_url: `/reports/${id}`,
      report_pdf_url: `/api/upload-batches/${id}/report-pdf`,
      report_text: reportText,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Report generation failed'
    await prisma.uploadBatch.update({
      where: { id },
      data: batchUpdateData({ report_status: 'failed', report_error: message }),
    }).catch(() => {})

    return NextResponse.json({ error: message, report_status: 'failed' }, { status: 500 })
  }
}

function getBatch(id: string) {
  return prisma.uploadBatch.findUnique({
    where: { id },
    include: {
      employee: { select: { display_name: true, name: true } },
      analysis_head: { select: { name: true } },
      call_scenario: { select: { name: true } },
      calls: { orderBy: { created_at: 'asc' } },
    },
  })
}
