import { NextResponse, type NextRequest } from 'next/server'
import { employees, idQueryValue, idToString, isDuplicateKeyError, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const $set: Record<string, unknown> = { updated_at: now() }
  if (body.name !== undefined) $set.name = body.name.trim()
  if (body.display_name !== undefined) $set.display_name = body.display_name.trim()
  if (body.employee_code !== undefined) $set.employee_code = body.employee_code.trim() || null
  if (body.email !== undefined) $set.email = body.email.trim() || null
  if (body.password !== undefined && body.password.trim() !== '') {
    $set.password = await bcrypt.hash(body.password.trim(), 10)
  }
  if (body.default_language !== undefined) $set.default_language = body.default_language
  if (body.status !== undefined) $set.status = body.status

  const col = await employees()

  try {
    const result = await col.findOneAndUpdate(
      { _id: idQueryValue(id) },
      { $set },
      { returnDocument: 'after' },
    )
    if (!result) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    const { password: _pw, _id, ...rest } = result
    return NextResponse.json({ id: idToString(_id), ...rest })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Employee code or email already exists' }, { status: 409 })
    }
    throw e
  }
}
