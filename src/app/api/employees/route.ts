import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      where: { status: 'active' },
      select: { id: true, display_name: true },
      orderBy: { display_name: 'asc' },
    })
    return NextResponse.json(employees)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 })
  }
}
