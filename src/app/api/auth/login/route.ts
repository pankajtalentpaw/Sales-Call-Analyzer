import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
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

  const employee = await prisma.employee.findUnique({
    where: { email: email.trim() },
  })

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

  const token = await signEmployeeToken(employee.id)

  const response = NextResponse.json({ success: true, employeeId: employee.id })
  response.cookies.set('employee_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60, // 8 hours
    path: '/',
  })

  return response
}
