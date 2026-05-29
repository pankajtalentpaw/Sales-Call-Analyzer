import { NextResponse, type NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'
import { admins, isDuplicateKeyError, now } from '@/lib/db/collections'
import { requireAuth } from '@/lib/auth'

function adminRegisterError(error: unknown) {
  console.error('Admin register failed:', error)

  if (error instanceof Error && error.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 })
  }

  return NextResponse.json(
    { error: 'Database error while creating admin account. Check DATABASE_URL and MongoDB access.' },
    { status: 503 },
  )
}

export async function POST(request: NextRequest) {
  let body: { email?: string; emailId?: string; password?: string; name?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const emailId = (body.emailId ?? body.email)?.trim().toLowerCase() ?? ''
  const password = body.password?.trim() ?? ''
  const name = body.name?.trim() || null
  const role = body.role?.trim().toLowerCase() ?? 'admin'

  if (!emailId || !password) {
    return NextResponse.json({ error: 'Email ID and password are required' }, { status: 400 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only admin registration is supported' }, { status: 400 })
  }

  try {
    const col = await admins()
    await col.createIndex({ email_id: 1 }, { unique: true })

    const adminCount = await col.countDocuments()
    if (adminCount > 0 && !(await requireAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const oid = new ObjectId()
    await col.insertOne({
      _id: oid,
      email_id: emailId,
      password: await bcrypt.hash(password, 10),
      name,
      status: 'active',
      created_at: now(),
      updated_at: now(),
    })

    return NextResponse.json(
      {
        id: oid.toHexString(),
        emailId,
        name,
        status: 'active',
      },
      { status: 201 },
    )
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'Admin email ID already exists' }, { status: 409 })
    }
    return adminRegisterError(e)
  }
}
