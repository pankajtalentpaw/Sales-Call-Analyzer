import { NextResponse, type NextRequest } from 'next/server'
import { verifyEmployeeToken } from '@/lib/auth'
import { employees, idQueryValue, idToString } from '@/lib/db/collections'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('employee_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await verifyEmployeeToken(token)
  if (!payload || !payload.employeeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const col = await employees()
  const employee = await col.findOne({ _id: idQueryValue(payload.employeeId as string) })

  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { password: _pw, ...rest } = employee
  return NextResponse.json({
    employee: { ...rest, id: idToString(employee._id), _id: undefined },
  })
}
