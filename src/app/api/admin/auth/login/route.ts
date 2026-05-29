import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { admins } from '@/lib/db/collections'
import { signToken } from '@/lib/auth'

function adminLoginError(error: unknown) {
  console.error('Admin login failed:', error)

  if (error instanceof Error && error.message.includes('JWT_SECRET')) {
    return NextResponse.json({ error: 'JWT_SECRET is not configured' }, { status: 500 })
  }

  if (error instanceof Error && error.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 500 })
  }

  return NextResponse.json(
    { error: 'Database error while logging in. Check DATABASE_URL and MongoDB access.' },
    { status: 503 },
  )
}

export async function POST(request: NextRequest) {
  let body: { emailId?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const emailId = body.emailId?.trim().toLowerCase() ?? ''
  const password = body.password?.trim() ?? ''

  if (!emailId || !password) {
    return NextResponse.json({ error: 'Email ID and password are required' }, { status: 400 })
  }

  try {
    const col = await admins()
    const admin = await col.findOne({ email_id: emailId })

    if (!admin) {
      return NextResponse.json({ error: 'Invalid email ID or password' }, { status: 401 })
    }

    if (admin.status !== 'active') {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const isMatch = await bcrypt.compare(password, admin.password)
    if (!isMatch) {
      return NextResponse.json({ error: 'Invalid email ID or password' }, { status: 401 })
    }

    const token = await signToken(admin._id.toHexString())
    const response = NextResponse.json({ ok: true })
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    })
    return response
  } catch (e) {
    return adminLoginError(e)
  }
}
