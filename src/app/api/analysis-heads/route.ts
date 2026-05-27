import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const heads = await prisma.analysisHead.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(heads)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analysis heads' }, { status: 500 })
  }
}
