import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyEmployeeToken } from '@/lib/auth'
import { generateAnalysisReport } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('employee_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyEmployeeToken(token)
  if (!payload || !payload.employeeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { employee_id, date_from, date_to, analysis_head_id, call_scenario_id } = body as {
    employee_id?: string
    date_from?: string
    date_to?: string
    analysis_head_id?: string
    call_scenario_id?: string
  }

  if (!date_from || !date_to) {
    return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 })
  }

  const where = {
    transcription_status: 'completed',
    ...(employee_id && { employee_id }),
    ...(analysis_head_id && { analysis_head_id }),
    ...(call_scenario_id && { call_scenario_id }),
    call_datetime: {
      gte: new Date(date_from),
      lte: new Date(`${date_to}T23:59:59.999Z`),
    },
  }

  const calls = await prisma.call.findMany({
    where,
    include: {
      employee: { select: { display_name: true, name: true } },
      analysis_head: { select: { name: true } },
      call_scenario: { select: { name: true } },
    },
    orderBy: { call_datetime: 'asc' },
  })

  if (calls.length === 0) {
    return NextResponse.json(
      { error: 'No completed transcripts found for the selected filters.' },
      { status: 404 },
    )
  }

  // Head-specific master file first, then global
  let masterFile = null
  if (analysis_head_id) {
    masterFile = await prisma.masterFile.findFirst({
      where: { is_active: true, scope: 'head-specific', analysis_head_id },
    })
  }
  if (!masterFile) {
    masterFile = await prisma.masterFile.findFirst({
      where: { is_active: true, scope: 'global' },
    })
  }

  if (!masterFile?.extracted_text) {
    return NextResponse.json(
      { error: 'No active master file configured. Please contact admin.' },
      { status: 400 },
    )
  }

  const [employeeLabel, headLabel, scenarioLabel] = await Promise.all([
    employee_id
      ? prisma.employee
          .findUnique({ where: { id: employee_id }, select: { display_name: true } })
          .then((e) => e?.display_name ?? 'Unknown')
      : Promise.resolve('All Employees'),
    analysis_head_id
      ? prisma.analysisHead
          .findUnique({ where: { id: analysis_head_id }, select: { name: true } })
          .then((h) => h?.name ?? 'All')
      : Promise.resolve('All'),
    call_scenario_id
      ? prisma.callScenario
          .findUnique({ where: { id: call_scenario_id }, select: { name: true } })
          .then((s) => s?.name ?? 'All')
      : Promise.resolve('All'),
  ])

  try {
    const { reportText } = await generateAnalysisReport({
      masterFileText: masterFile.extracted_text,
      filters: {
        employeeName: employeeLabel,
        dateFrom: date_from,
        dateTo: date_to,
        analysisHead: headLabel,
        callScenario: scenarioLabel,
      },
      calls: calls.map((c) => ({
        callId: c.id,
        employeeName: c.employee.display_name || c.employee.name,
        callDatetime: c.call_datetime.toISOString(),
        durationSeconds: c.duration_seconds ?? undefined,
        scenarioName: c.call_scenario.name,
        transcript: c.transcript_text ?? '',
      })),
    })

    return NextResponse.json({ report: reportText, call_count: calls.length })
  } catch (err) {
    console.error('Analysis report generation failed:', err)
    return NextResponse.json({ error: 'Report generation failed. Please try again.' }, { status: 500 })
  }
}
