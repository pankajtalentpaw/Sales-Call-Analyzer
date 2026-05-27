import { NextResponse, type NextRequest } from 'next/server'
import { verifyEmployeeToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('employee_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyEmployeeToken(token)
  if (!payload || !payload.employeeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const employee = await prisma.employee.findUnique({
    where: { id: payload.employeeId as string }
  })

  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { password, ...safeEmployee } = employee
  return NextResponse.json({ employee: safeEmployee })
}
