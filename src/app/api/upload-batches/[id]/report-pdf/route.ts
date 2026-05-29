import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { uploadBatches, toOid } from '@/lib/db/collections'
import { getDb } from '@/lib/mongodb'
import { createReportPdf } from '@/lib/pdf'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let oid: ObjectId
  try { oid = toOid(id) } catch {
    return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })
  }

  const batch = await (await uploadBatches()).findOne({ _id: oid })
  if (!batch) return NextResponse.json({ error: 'Upload batch not found' }, { status: 404 })
  if (!batch.report_text) return NextResponse.json({ error: 'Report is not ready yet' }, { status: 409 })

  const db = await getDb()
  const [employee, analysisHead, callScenario] = await Promise.all([
    db.collection('employees').findOne({ _id: batch.employee_id }, { projection: { display_name: 1, name: 1 } }),
    db.collection('analysis_heads').findOne({ _id: batch.analysis_head_id }, { projection: { name: 1 } }),
    db.collection('call_scenarios').findOne({ _id: batch.call_scenario_id }, { projection: { name: 1 } }),
  ])

  const emp = employee as { display_name?: string; name?: string } | null
  const head = analysisHead as { name?: string } | null
  const scenario = callScenario as { name?: string } | null

  const fileName = safeFileName(`analysis-report-${id}.pdf`)
  const pdf = createReportPdf({
    title: 'Sales Call Analysis Report',
    metadata: [
      { label: 'Employee', value: emp?.display_name || emp?.name || 'Unknown' },
      { label: 'Analysis Head', value: head?.name || 'Unknown' },
      { label: 'Call Scenario', value: scenario?.name || 'Unknown' },
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
