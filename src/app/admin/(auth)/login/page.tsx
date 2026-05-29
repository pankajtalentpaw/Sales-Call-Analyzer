'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ApiError = { error?: string }

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [emailId, setEmailId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const normalizedEmailId = emailId.trim().toLowerCase()
      const normalizedPassword = password.trim()
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: normalizedEmailId, password: normalizedPassword }),
      })
      if (res.ok) {
        router.push('/admin/employees')
        router.refresh()
      } else {
        const data = await readJson<ApiError>(res).catch(() => null)
        setError(data?.error ?? 'Invalid email ID or password')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm select-none">
            AI
          </div>
          <span className="font-semibold text-gray-900">Sales Dashboard</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Admin Login</h1>
          <p className="text-sm text-gray-500 mb-7">Sales Call Analyzer — Admin Panel</p>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Email ID</label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={emailId}
                onChange={(e) => { setEmailId(e.target.value); setError('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
                placeholder="admin@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex justify-center items-center gap-2 bg-blue-600 text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Employee?{' '}
          <a href="/login" className="text-blue-600 hover:underline">Sign in here</a>
        </p>
      </div>
    </div>
  )
}
