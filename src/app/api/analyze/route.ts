import { type NextRequest, NextResponse } from 'next/server'
import { calls, masterFiles, employees, analysisHeads, callScenarios, idQueryValue, idToString } from '@/lib/db/collections'
import { verifyEmployeeToken, verifyToken } from '@/lib/auth'
import { generateAnalysisReport } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  const employeeToken = request.cookies.get('employee_session')?.value
  const adminToken = request.cookies.get('admin_session')?.value
  const employeePayload = employeeToken ? await verifyEmployeeToken(employeeToken) : null
  const adminPayload = adminToken ? await verifyToken(adminToken) : null
  const isAdmin = Boolean(adminPayload)
  const sessionEmployeeId =
    typeof employeePayload?.employeeId === 'string' ? employeePayload.employeeId : null

  if (!isAdmin && !sessionEmployeeId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const match: Record<string, unknown> = {
    transcription_status: 'completed',
    call_datetime: { $gte: new Date(date_from), $lte: new Date(date_to) },
  }
  const effectiveEmployeeId = isAdmin ? employee_id : sessionEmployeeId

  if (effectiveEmployeeId) match.employee_id = idQueryValue(effectiveEmployeeId)
  if (analysis_head_id) match.analysis_head_id = idQueryValue(analysis_head_id)
  if (call_scenario_id) match.call_scenario_id = idQueryValue(call_scenario_id)

  const callsCol = await calls()
  const matchedCalls = await callsCol
    .aggregate([
      { $match: match },
      { $sort: { call_datetime: 1 } },
      {
        $lookup: {
          from: 'employees',
          localField: 'employee_id',
          foreignField: '_id',
          pipeline: [{ $project: { display_name: 1, name: 1 } }],
          as: 'employee',
        },
      },
      { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'analysis_heads',
          localField: 'analysis_head_id',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1 } }],
          as: 'analysis_head',
        },
      },
      { $unwind: { path: '$analysis_head', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'call_scenarios',
          localField: 'call_scenario_id',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1 } }],
          as: 'call_scenario',
        },
      },
      { $unwind: { path: '$call_scenario', preserveNullAndEmptyArrays: true } },
    ])
    .toArray()

  if (matchedCalls.length === 0) {
    return NextResponse.json(
      { error: 'No completed transcripts found for the selected filters.' },
      { status: 404 },
    )
  }

  const mfCol = await masterFiles()
  let masterFile = null
  if (analysis_head_id) {
    masterFile = await mfCol.findOne({
      is_active: true,
      scope: 'head-specific',
      analysis_head_id: idQueryValue(analysis_head_id),
    })
  }
  if (!masterFile) {
    masterFile = await mfCol.findOne({ is_active: true, scope: 'global' })
  }

  if (!masterFile?.extracted_text) {
    return NextResponse.json(
      { error: 'No active master file configured. Please contact admin.' },
      { status: 400 },
    )
  }

  const [employeeLabel, headLabel, scenarioLabel] = await Promise.all([
    effectiveEmployeeId
      ? (await employees())
          .findOne({ _id: idQueryValue(effectiveEmployeeId) }, { projection: { display_name: 1 } })
          .then((e: { display_name?: string } | null) => e?.display_name ?? 'Unknown')
      : Promise.resolve('All Employees'),
    analysis_head_id
      ? (await analysisHeads())
          .findOne({ _id: idQueryValue(analysis_head_id) }, { projection: { name: 1 } })
          .then((h: { name?: string } | null) => h?.name ?? 'All')
      : Promise.resolve('All'),
    call_scenario_id
      ? (await callScenarios())
          .findOne({ _id: idQueryValue(call_scenario_id) }, { projection: { name: 1 } })
          .then((s: { name?: string } | null) => s?.name ?? 'All')
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
      calls: matchedCalls.map((c: Record<string, unknown>) => ({
        callId: idToString(c._id),
        employeeName:
          (c.employee as { display_name?: string; name?: string } | null)?.display_name ||
          (c.employee as { name?: string } | null)?.name ||
          'Unknown',
        callDatetime: new Date(c.call_datetime as string | Date).toISOString(),
        durationSeconds: (c.duration_seconds as number | null) ?? undefined,
        scenarioName: (c.call_scenario as { name?: string } | null)?.name ?? '',
        transcript: (c.transcript_text as string | null) ?? '',
      })),
    })

    return NextResponse.json({ report: reportText, call_count: matchedCalls.length })
  } catch (err) {
    console.error('Analysis report generation failed:', err)
    return NextResponse.json({ error: 'Report generation failed. Please try again.' }, { status: 500 })
  }
}
