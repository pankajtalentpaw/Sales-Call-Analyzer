import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { type NextRequest } from 'next/server'

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(s)
}

export async function signToken(adminId: string): Promise<string> {
  return new SignJWT({ sub: 'admin', adminId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret())
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (payload.sub !== 'admin' || typeof payload.adminId !== 'string') return null
    return payload
  } catch {
    return null
  }
}

export async function signEmployeeToken(employeeId: string): Promise<string> {
  return new SignJWT({ sub: 'employee', employeeId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret())
}

export async function verifyEmployeeToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (payload.sub !== 'employee') return null;
    return payload
  } catch {
    return null
  }
}

export async function requireAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_session')?.value
  if (!token) return false
  return (await verifyToken(token)) !== null
}

// Accepts either an employee session or an admin session.
// Use this for APIs that both employees and admins need to call.
export async function requireAnyAuth(request: NextRequest): Promise<boolean> {
  const employeeToken = request.cookies.get('employee_session')?.value
  if (employeeToken) {
    const payload = await verifyEmployeeToken(employeeToken)
    if (payload?.employeeId) return true
  }
  const adminToken = request.cookies.get('admin_session')?.value
  if (adminToken) {
    const payload = await verifyToken(adminToken)
    if (payload) return true
  }
  return false
}
