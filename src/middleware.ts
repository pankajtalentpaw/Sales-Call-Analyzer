import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, verifyEmployeeToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login' || pathname === '/api/admin/auth/login' || pathname === '/api/admin/auth/register' || pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/register') {
    return NextResponse.next()
  }

  // Admin routing
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) {
    const adminToken = request.cookies.get('admin_session')?.value
    const isApiRoute = pathname.startsWith('/api/admin/')

    if (!adminToken) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const payload = await verifyToken(adminToken)
    if (!payload) {
      const response = isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', request.url))
      response.cookies.delete('admin_session')
      return response
    }
    return NextResponse.next()
  }

  // Analysis page: employee OR admin can generate analysis.
  if (pathname === '/analyze') {
    const employeeToken = request.cookies.get('employee_session')?.value
    const adminToken = request.cookies.get('admin_session')?.value

    const employeePayload = employeeToken ? await verifyEmployeeToken(employeeToken) : null
    const adminPayload = adminToken ? await verifyToken(adminToken) : null

    if (!employeePayload?.employeeId && !adminPayload) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  // Manager-only pages: require admin session
  const managerPages = ['/calls']
  if (managerPages.includes(pathname)) {
    const adminToken = request.cookies.get('admin_session')?.value
    const payload = adminToken ? await verifyToken(adminToken) : null
    if (!payload) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  // Report pages: accessible to employee OR admin (employee gets redirected here after upload)
  if (pathname.startsWith('/reports')) {
    const employeeToken = request.cookies.get('employee_session')?.value
    const adminToken    = request.cookies.get('admin_session')?.value
    const employeeOk    = employeeToken ? !!(await verifyEmployeeToken(employeeToken))?.employeeId : false
    const adminOk       = adminToken    ? !!(await verifyToken(adminToken))                         : false
    if (!employeeOk && !adminOk) return NextResponse.redirect(new URL('/login', request.url))
    return NextResponse.next()
  }

  // Employee upload page: require employee session
  if (pathname === '/') {
    const employeeToken = request.cookies.get('employee_session')?.value
    if (!employeeToken) return NextResponse.redirect(new URL('/login', request.url))
    const payload = await verifyEmployeeToken(employeeToken)
    if (!payload || !payload.employeeId) {
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('employee_session')
      return response
    }
    return NextResponse.next()
  }

  // API routes (non-admin): require employee OR admin session
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/admin/')) {
    const employeeToken = request.cookies.get('employee_session')?.value
    const adminToken = request.cookies.get('admin_session')?.value

    const employeePayload = employeeToken ? await verifyEmployeeToken(employeeToken) : null
    const adminPayload = adminToken ? await verifyToken(adminToken) : null

    if (!employeePayload?.employeeId && !adminPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
