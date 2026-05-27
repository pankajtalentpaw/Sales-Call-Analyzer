import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function GET(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const employees = await prisma.employee.findMany({ orderBy: { display_name: 'asc' } })
  // Don't send back passwords
  const safeEmployees = employees.map(emp => {
    const { password, ...rest } = emp;
    return rest;
  })
  return NextResponse.json(safeEmployees)
}

export async function POST(request: NextRequest) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { name, display_name, employee_code, default_language, email, password } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!display_name?.trim()) return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!password?.trim()) return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  const langs = ['Hindi', 'Gujarati', 'English', 'Mixed']
  if (default_language && !langs.includes(default_language)) {
    return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(password.trim(), 10)

  try {
    const employee = await prisma.employee.create({
      data: {
        name: name.trim(),
        display_name: display_name.trim(),
        employee_code: employee_code?.trim() || undefined,
        email: email.trim(),
        password: hashedPassword,
        default_language: default_language || 'Mixed',
      },
    })
    const { password: _, ...safeEmployee } = employee;
    return NextResponse.json(safeEmployee, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Employee code or email already exists' }, { status: 409 })
    }
    throw e
  }
}
