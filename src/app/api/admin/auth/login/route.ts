import { NextResponse, type NextRequest } from 'next/server'
import { signToken } from '@/lib/auth'
import { timingSafeEqual } from 'crypto'

function safeCompare(submitted: string, expected: string): boolean {
  const aBytes = Buffer.from(submitted)
  const bBytes = Buffer.from(expected)

  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes)
}

export async function POST(request: NextRequest) {
  let body: { emailId?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const submittedEmailId = body.emailId ?? ''
  const submittedPassword = body.password ?? ''
  const expectedEmailId = process.env.ADMIN_EMAIL_ID ?? ''
  const expectedPassword = process.env.ADMIN_PASSWORD ?? ''

  if (!expectedEmailId || !expectedPassword) {
    return NextResponse.json(
      { error: 'ADMIN_EMAIL_ID and ADMIN_PASSWORD must be configured' },
      { status: 500 },
    )
  }

  const match =
    safeCompare(submittedEmailId, expectedEmailId) &&
    safeCompare(submittedPassword, expectedPassword)

  if (!match) {
    return NextResponse.json({ error: 'Invalid email ID or password' }, { status: 401 })
  }

  const token = await signToken()
  const response = NextResponse.json({ ok: true })
  response.cookies.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  })
  return response
}
