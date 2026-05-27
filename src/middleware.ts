import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, verifyEmployeeToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login' || pathname === '/api/admin/auth/login' || pathname === '/login' || pathname === '/api/auth/login') {
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

  // Employee root/dashboard routing
  const employeePages = ['/', '/calls', '/analyze']
  if (employeePages.includes(pathname) || (pathname.startsWith('/api/') && !pathname.startsWith('/api/admin/'))) {
    const employeeToken = request.cookies.get('employee_session')?.value
    const isApiRoute = pathname.startsWith('/api/')

    if (!employeeToken) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url))
    }

    const payload = await verifyEmployeeToken(employeeToken)
    if (!payload || !payload.employeeId) {
      const response = isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('employee_session')
      return response
    }
    
    // Pass employeeId to API routes if needed, although they should rely on the token itself ideally.
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
