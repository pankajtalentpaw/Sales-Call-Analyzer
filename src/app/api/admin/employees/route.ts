import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { employees, idToString, isDuplicateKeyError, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function GET(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const col = await employees()
  const docs = await col.find({}).sort({ display_name: 1 }).toArray()
  return NextResponse.json(
    docs.map(({ password: _pw, _id, ...rest }) => ({ id: idToString(_id), ...rest })),
  )
}

export async function POST(request: NextRequest) {
  if (!(await requireAuth(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const col = await employees()

  try {
    const oid = new ObjectId()
    await col.insertOne({
      _id: oid,
      name: name.trim(),
      display_name: display_name.trim(),
      employee_code: employee_code?.trim() || null,
      email: email.trim(),
      password: hashedPassword,
      default_language: default_language || 'Mixed',
      status: 'active',
      created_at: now(),
      updated_at: now(),
    })
    const doc = await col.findOne({ _id: oid })
    if (!doc) return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 })
    const { password: _pw, _id, ...rest } = doc
    return NextResponse.json({ id: idToString(_id), ...rest }, { status: 201 })
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Employee code or email already exists' }, { status: 409 })
    }
    throw e
  }
}
