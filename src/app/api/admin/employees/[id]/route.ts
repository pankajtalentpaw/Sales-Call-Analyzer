import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, string>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const langs = ['Hindi', 'Gujarati', 'English', 'Mixed']
  if (body.default_language && !langs.includes(body.default_language)) {
    return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
  }
  if (body.status && !['active', 'inactive'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const data: Prisma.EmployeeUpdateInput = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.display_name !== undefined) data.display_name = body.display_name.trim()
  if (body.employee_code !== undefined) data.employee_code = body.employee_code.trim() || null
  if (body.email !== undefined) data.email = body.email.trim() || null
  if (body.password !== undefined && body.password.trim() !== '') {
    data.password = await bcrypt.hash(body.password.trim(), 10)
  }
  if (body.default_language !== undefined) data.default_language = body.default_language
  if (body.status !== undefined) data.status = body.status

  try {
    const employee = await prisma.employee.update({ where: { id }, data })
    const { password: _, ...safeEmployee } = employee
    return NextResponse.json(safeEmployee)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      if (e.code === 'P2002') return NextResponse.json({ error: 'Employee code or email already exists' }, { status: 409 })
    }
    throw e
  }
}
