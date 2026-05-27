import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const analysisHeadId = new URL(request.url).searchParams.get('analysis_head_id')
    if (!analysisHeadId) {
      return NextResponse.json({ error: 'analysis_head_id is required' }, { status: 400 })
    }

    const scenarios = await prisma.callScenario.findMany({
      where: { analysis_head_id: analysisHeadId, status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(scenarios)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch call scenarios' }, { status: 500 })
  }
}
