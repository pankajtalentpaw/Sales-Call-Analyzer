import { NextResponse, type NextRequest } from 'next/server'
import { employees, idToString } from '@/lib/db/collections'
import { signEmployeeToken } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, password } = body

  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const col = await employees()
  const employee = await col.findOne({ email: email.trim() })

  if (!employee || !employee.password) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  if (employee.status !== 'active') {
    return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  }

  const isMatch = await bcrypt.compare(password, employee.password)
  if (!isMatch) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const employeeId = idToString(employee._id)
  const token = await signEmployeeToken(employeeId)

  const response = NextResponse.json({ success: true, employeeId })
  response.cookies.set('employee_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60,
    path: '/',
  })

  return response
}
