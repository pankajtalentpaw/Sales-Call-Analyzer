import { type NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { calls, toOid } from '@/lib/db/collections'
import { requireAnyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await requireAnyAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const employee_id = searchParams.get('employee_id') || undefined
  const analysis_head_id = searchParams.get('analysis_head_id') || undefined
  const call_scenario_id = searchParams.get('call_scenario_id') || undefined
  const date_from = searchParams.get('date_from') || undefined
  const date_to = searchParams.get('date_to') || undefined
  const transcription_status = searchParams.get('transcription_status') || undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  const match: Record<string, unknown> = {}
  if (employee_id) match.employee_id = toOid(employee_id)
  if (analysis_head_id) match.analysis_head_id = toOid(analysis_head_id)
  if (call_scenario_id) match.call_scenario_id = toOid(call_scenario_id)
  if (transcription_status) match.transcription_status = transcription_status
  if (date_from || date_to) {
    const range: Record<string, Date> = {}
    if (date_from) range.$gte = new Date(date_from)
    if (date_to) range.$lte = new Date(date_to)
    match.call_datetime = range
  }

  try {
    const col = await calls()

    const [results, totalArr] = await Promise.all([
      col
        .aggregate([
          { $match: match },
          { $sort: { call_datetime: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: 'employees',
              localField: 'employee_id',
              foreignField: '_id',
              pipeline: [{ $project: { _id: 1, name: 1, display_name: 1 } }],
              as: 'employee',
            },
          },
          { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'analysis_heads',
              localField: 'analysis_head_id',
              foreignField: '_id',
              pipeline: [{ $project: { _id: 1, name: 1 } }],
              as: 'analysis_head',
            },
          },
          { $unwind: { path: '$analysis_head', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'call_scenarios',
              localField: 'call_scenario_id',
              foreignField: '_id',
              pipeline: [{ $project: { _id: 1, name: 1 } }],
              as: 'call_scenario',
            },
          },
          { $unwind: { path: '$call_scenario', preserveNullAndEmptyArrays: true } },
        ])
        .toArray(),
      col.countDocuments(match),
    ])

    const serialized = results.map((doc) => ({
      ...doc,
      id: (doc._id as ObjectId).toHexString(),
      _id: undefined,
      employee_id: (doc.employee_id as ObjectId).toHexString(),
      analysis_head_id: (doc.analysis_head_id as ObjectId).toHexString(),
      call_scenario_id: (doc.call_scenario_id as ObjectId).toHexString(),
      upload_batch_id: doc.upload_batch_id ? (doc.upload_batch_id as ObjectId).toHexString() : null,
      employee: doc.employee
        ? {
            id: (doc.employee._id as ObjectId).toHexString(),
            name: doc.employee.name,
            display_name: doc.employee.display_name,
          }
        : null,
      analysis_head: doc.analysis_head
        ? { id: (doc.analysis_head._id as ObjectId).toHexString(), name: doc.analysis_head.name }
        : null,
      call_scenario: doc.call_scenario
        ? { id: (doc.call_scenario._id as ObjectId).toHexString(), name: doc.call_scenario.name }
        : null,
    }))

    return NextResponse.json({
      calls: serialized,
      total: totalArr,
      page,
      totalPages: Math.ceil(totalArr / limit),
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
  }
}
