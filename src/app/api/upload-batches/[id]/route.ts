import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await prisma.uploadBatch.findUnique({
    where: { id },
    include: { calls: { select: { transcription_status: true, analysis_status: true } } },
  })

  if (!batch) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })

  return NextResponse.json({
    id: batch.id,
    total_files: batch.total_files,
    completed_files: batch.completed_files,
    failed_files: batch.failed_files,
    transcription: countStatuses(batch.calls.map((call) => call.transcription_status)),
    analysis: countStatuses(batch.calls.map((call) => call.analysis_status)),
    report_status: batch.report_status,
    report_file_url: batch.report_file_url,
    report_dashboard_url: batch.report_status === 'completed' ? `/reports/${batch.id}` : null,
    report_pdf_url: batch.report_status === 'completed' ? `/api/upload-batches/${batch.id}/report-pdf` : null,
    report_error: batch.report_error,
  })
}

function countStatuses(statuses: string[]) {
  return statuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = (acc[status] ?? 0) + 1
    return acc
  }, {})
}
