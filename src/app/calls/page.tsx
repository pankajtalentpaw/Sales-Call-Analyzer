'use client'

import { useState, useEffect, useCallback } from 'react'

type Employee = { id: string; display_name: string }
type AnalysisHead = { id: string; name: string }
type CallScenario = { id: string; name: string }

type CallRecord = {
  id: string
  file_name: string
  call_datetime: string
  duration_seconds: number | null
  transcription_status: string
  transcript_text: string | null
  language_detected: string | null
  employee: { id: string; display_name: string; name: string }
  analysis_head: { id: string; name: string }
  call_scenario: { id: string; name: string }
}

type CallsResponse = {
  calls: CallRecord[]
  total: number
  page: number
  totalPages: number
}

const today = () => new Date().toISOString().split('T')[0]

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium'
  if (status === 'completed') return <span className={`${base} bg-green-50 text-green-700`}>Completed</span>
  if (status === 'failed') return <span className={`${base} bg-red-50 text-red-700`}>Failed</span>
  if (status === 'processing') return <span className={`${base} bg-blue-50 text-blue-700`}>Processing</span>
  return <span className={`${base} bg-gray-100 text-gray-600`}>Pending</span>
}

export default function CallLibraryPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [analysisHeads, setAnalysisHeads] = useState<AnalysisHead[]>([])
  const [callScenarios, setCallScenarios] = useState<CallScenario[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterHead, setFilterHead] = useState('')
  const [filterScenario, setFilterScenario] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<CallsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)

  const [currentEmployee, setCurrentEmployee] = useState<{ display_name: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => r.json()),
      fetch('/api/employees').then((r) => r.json()),
      fetch('/api/analysis-heads').then((r) => r.json()),
    ]).then(([me, emps, heads]) => {
      if (me?.employee) setCurrentEmployee(me.employee)
      setEmployees(Array.isArray(emps) ? emps : [])
      setAnalysisHeads(Array.isArray(heads) ? heads : [])
    })
  }, [])

  useEffect(() => {
    if (!filterHead) {
      setCallScenarios([])
      setFilterScenario('')
      return
    }
    setLoadingScenarios(true)
    setFilterScenario('')
    fetch(`/api/call-scenarios?analysis_head_id=${filterHead}`)
      .then((r) => r.json())
      .then((d) => setCallScenarios(Array.isArray(d) ? d : []))
      .finally(() => setLoadingScenarios(false))
  }, [filterHead])

  const fetchCalls = useCallback(
    async (pageNum: number) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: '20' })
        if (filterEmployee) params.set('employee_id', filterEmployee)
        if (filterHead) params.set('analysis_head_id', filterHead)
        if (filterScenario) params.set('call_scenario_id', filterScenario)
        if (filterDateFrom) params.set('date_from', filterDateFrom)
        if (filterDateTo) params.set('date_to', filterDateTo)
        if (filterStatus) params.set('transcription_status', filterStatus)

        const res = await fetch(`/api/calls?${params}`)
        if (!res.ok) {
          setError('Failed to load calls. Please try again.')
          return
        }
        const json = (await res.json()) as CallsResponse
        setData(json)
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [filterEmployee, filterHead, filterScenario, filterDateFrom, filterDateTo, filterStatus],
  )

  useEffect(() => {
    void fetchCalls(page)
  }, [fetchCalls, page])

  const handleFilterChange = () => {
    setPage(1)
    setExpandedCallId(null)
    void fetchCalls(1)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                AI
              </div>
              <span className="font-semibold text-gray-900">Sales Dashboard</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1">
              <a href="/" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">
                Upload
              </a>
              <a href="/calls" className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">
                Call Library
              </a>
              <a href="/analyze" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">
                Analyze
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {currentEmployee ? `Logged in as ${currentEmployee.display_name}` : ''}
            </span>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                window.location.href = '/login'
              }}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Call Library</h1>
          <p className="mt-1 text-sm text-gray-500">Browse and filter all uploaded call recordings.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.display_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Analysis Head</label>
              <select
                value={filterHead}
                onChange={(e) => setFilterHead(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Heads</option>
                {analysisHeads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Call Scenario</label>
              <select
                value={filterScenario}
                onChange={(e) => setFilterScenario(e.target.value)}
                disabled={!filterHead || loadingScenarios}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{filterHead ? 'All Scenarios' : '— Select head first —'}</option>
                {callScenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
              <input
                type="date"
                value={filterDateFrom}
                max={today()}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
              <input
                type="date"
                value={filterDateTo}
                max={today()}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFilterEmployee('')
                setFilterHead('')
                setFilterScenario('')
                setFilterDateFrom('')
                setFilterDateTo('')
                setFilterStatus('')
                setPage(1)
              }}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleFilterChange}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {data ? `${data.total} call${data.total !== 1 ? 's' : ''}` : 'Calls'}
            </h2>
            {loading && (
              <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Employee</th>
                  <th className="px-5 py-3 font-medium">Call Date</th>
                  <th className="px-5 py-3 font-medium">Analysis Head</th>
                  <th className="px-5 py-3 font-medium">Call Scenario</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Transcript</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {!data || data.calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                      {loading ? 'Loading...' : 'No calls found for the selected filters.'}
                    </td>
                  </tr>
                ) : (
                  data.calls.flatMap((call) => {
                    const rows = [
                      <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {call.employee.display_name || call.employee.name}
                        </td>
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(call.call_datetime)}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{call.analysis_head.name}</td>
                        <td className="px-5 py-3 text-gray-600">{call.call_scenario.name}</td>
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                          {formatDuration(call.duration_seconds)}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={call.transcription_status} />
                        </td>
                        <td className="px-5 py-3">
                          {call.transcription_status === 'completed' && call.transcript_text ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCallId(expandedCallId === call.id ? null : call.id)
                              }
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              {expandedCallId === call.id ? 'Hide' : 'View'}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>,
                    ]

                    if (expandedCallId === call.id && call.transcript_text) {
                      rows.push(
                        <tr key={`${call.id}-transcript`} className="bg-blue-50">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">
                                Transcript — {call.file_name}
                              </span>
                              {call.language_detected && (
                                <span className="text-xs text-blue-500">[{call.language_detected}]</span>
                              )}
                            </div>
                            <pre className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed font-sans max-h-72 overflow-y-auto bg-white rounded-lg border border-blue-100 p-3">
                              {call.transcript_text}
                            </pre>
                          </td>
                        </tr>,
                      )
                    }

                    return rows
                  })
                )}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
