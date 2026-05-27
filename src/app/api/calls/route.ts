import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyEmployeeToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('employee_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyEmployeeToken(token)
  if (!payload || !payload.employeeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const employee_id = searchParams.get('employee_id') || undefined
  const analysis_head_id = searchParams.get('analysis_head_id') || undefined
  const call_scenario_id = searchParams.get('call_scenario_id') || undefined
  const date_from = searchParams.get('date_from') || undefined
  const date_to = searchParams.get('date_to') || undefined
  const transcription_status = searchParams.get('transcription_status') || undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  const where = {
    ...(employee_id && { employee_id }),
    ...(analysis_head_id && { analysis_head_id }),
    ...(call_scenario_id && { call_scenario_id }),
    ...(transcription_status && { transcription_status }),
    ...((date_from || date_to) && {
      call_datetime: {
        ...(date_from && { gte: new Date(date_from) }),
        ...(date_to && { lte: new Date(`${date_to}T23:59:59.999Z`) }),
      },
    }),
  }

  try {
    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where,
        include: {
          employee: { select: { id: true, display_name: true, name: true } },
          analysis_head: { select: { id: true, name: true } },
          call_scenario: { select: { id: true, name: true } },
        },
        orderBy: { call_datetime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.call.count({ where }),
    ])

    return NextResponse.json({
      calls,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
  }
}
