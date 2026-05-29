import { type NextRequest, NextResponse } from 'next/server'
import { callScenarios, idQueryValue, idToString } from '@/lib/db/collections'

export async function GET(request: NextRequest) {
  try {
    const analysisHeadId = new URL(request.url).searchParams.get('analysis_head_id')
    if (!analysisHeadId) {
      return NextResponse.json({ error: 'analysis_head_id is required' }, { status: 400 })
    }

    const col = await callScenarios()
    const docs = await col
      .find(
        { analysis_head_id: idQueryValue(analysisHeadId), status: 'active' },
        { projection: { _id: 1, name: 1 } },
      )
      .sort({ name: 1 })
      .toArray()

    return NextResponse.json(docs.map((d) => ({ id: idToString(d._id), name: d.name })))
  } catch (error) {
    console.error('Failed to fetch call scenarios:', error)
    return NextResponse.json({ error: 'Failed to fetch call scenarios' }, { status: 500 })
  }
}
