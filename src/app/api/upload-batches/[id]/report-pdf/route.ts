import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createReportPdf } from '@/lib/pdf'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await prisma.uploadBatch.findUnique({
    where: { id },
    include: {
      employee: { select: { display_name: true, name: true } },
      analysis_head: { select: { name: true } },
      call_scenario: { select: { name: true } },
    },
  })

  if (!batch) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })
  if (!batch.report_text) {
    return NextResponse.json({ error: 'Report is not ready yet' }, { status: 409 })
  }

  const fileName = safeFileName(`analysis-report-${batch.id}.pdf`)
  const pdf = createReportPdf({
    title: 'Sales Call Analysis Report',
    metadata: [
      { label: 'Employee', value: batch.employee.display_name || batch.employee.name },
      { label: 'Analysis Head', value: batch.analysis_head.name },
      { label: 'Call Scenario', value: batch.call_scenario.name },
      { label: 'Call Date', value: batch.batch_date.toISOString().split('T')[0] },
      { label: 'Total Audio Files', value: String(batch.total_files) },
      { label: 'Generated At', value: batch.report_generated_at?.toISOString() ?? '' },
    ],
    reportText: batch.report_text,
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-')
}
