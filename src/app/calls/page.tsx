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

function localDatetime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
const nowLocal = () => localDatetime(new Date())

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type StatusConfig = { label: string; dot: string; text: string; bg: string }
const STATUS_CONFIG: Record<string, StatusConfig> = {
  completed:  { label: 'Completed',  dot: 'bg-green-500',  text: 'text-green-700', bg: 'bg-green-50' },
  failed:     { label: 'Failed',     dot: 'bg-red-500',    text: 'text-red-700',   bg: 'bg-red-50' },
  processing: { label: 'Processing', dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700', bg: 'bg-blue-50' },
  pending:    { label: 'Pending',    dot: 'bg-gray-400',   text: 'text-gray-600',  bg: 'bg-gray-100' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
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

  useEffect(() => {
    Promise.all([
      fetch('/api/employees').then((r) => r.json()),
      fetch('/api/analysis-heads').then((r) => r.json()),
    ]).then(([emps, heads]) => {
      setEmployees(Array.isArray(emps) ? emps : [])
      setAnalysisHeads(Array.isArray(heads) ? heads : [])
    })
  }, [])

  useEffect(() => {
    if (!filterHead) { setCallScenarios([]); setFilterScenario(''); return }
    setLoadingScenarios(true)
    setFilterScenario('')
    fetch(`/api/call-scenarios?analysis_head_id=${filterHead}`)
      .then((r) => r.json())
      .then((d) => setCallScenarios(Array.isArray(d) ? d : []))
      .finally(() => setLoadingScenarios(false))
  }, [filterHead])

  const fetchCalls = useCallback(async (pageNum: number) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '20' })
      if (filterEmployee) params.set('employee_id', filterEmployee)
      if (filterHead)     params.set('analysis_head_id', filterHead)
      if (filterScenario) params.set('call_scenario_id', filterScenario)
      if (filterDateFrom) params.set('date_from', new Date(filterDateFrom).toISOString())
      if (filterDateTo)   params.set('date_to',   new Date(filterDateTo).toISOString())
      if (filterStatus)   params.set('transcription_status', filterStatus)

      const res = await fetch(`/api/calls?${params}`)
      if (!res.ok) { setError('Failed to load calls. Please try again.'); return }
      setData((await res.json()) as CallsResponse)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [filterEmployee, filterHead, filterScenario, filterDateFrom, filterDateTo, filterStatus])

  useEffect(() => { void fetchCalls(page) }, [fetchCalls, page])

  const handleApply = () => { setPage(1); setExpandedCallId(null); void fetchCalls(1) }

  const handleClear = () => {
    setFilterEmployee(''); setFilterHead(''); setFilterScenario('')
    setFilterDateFrom(''); setFilterDateTo(''); setFilterStatus('')
    setPage(1); setExpandedCallId(null)
  }

  const completedCount  = data?.calls.filter(c => c.transcription_status === 'completed').length ?? 0
  const processingCount = data?.calls.filter(c => c.transcription_status === 'processing').length ?? 0
  const failedCount     = data?.calls.filter(c => c.transcription_status === 'failed').length ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm select-none">AI</div>
              <span className="font-semibold text-gray-900 text-sm">Sales Dashboard</span>
            </div>
            <nav className="hidden sm:flex items-center gap-0.5">
              <a href="/admin"   className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors">Admin</a>
              <a href="/calls"   className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">Call Library</a>
              <a href="/analyze" className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors">Analyze</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={async () => { await fetch('/api/admin/auth/logout', { method: 'POST' }); window.location.href = '/admin/login' }} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Page title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Call Library</h1>
            <p className="mt-1 text-sm text-gray-500">Browse, filter, and inspect all uploaded call recordings.</p>
          </div>
          {loading && (
            <svg className="h-5 w-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Filter card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filters
            </h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Employee</label>
                <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800">
                  <option value="">All</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Analysis Head</label>
                <select value={filterHead} onChange={(e) => setFilterHead(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800">
                  <option value="">All</option>
                  {analysisHeads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Scenario</label>
                <select value={filterScenario} onChange={(e) => setFilterScenario(e.target.value)} disabled={!filterHead || loadingScenarios} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">{filterHead ? 'All' : '— Head first —'}</option>
                  {callScenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">From</label>
                <input type="datetime-local" value={filterDateFrom} max={nowLocal()} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">To</label>
                <input type="datetime-local" value={filterDateTo} max={nowLocal()} onChange={(e) => setFilterDateTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Status</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800">
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleClear} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Clear</button>
              <button
                type="button"
                onClick={handleApply}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching…
                  </>
                ) : 'Apply Filters'}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
            <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
            </svg>
            {error}
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Table header row */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-semibold text-gray-900">
                {data ? `${data.total.toLocaleString()} call${data.total !== 1 ? 's' : ''}` : 'Calls'}
              </h2>
              {data && data.calls.length > 0 && (
                <div className="hidden sm:flex items-center gap-2">
                  {completedCount > 0  && <span className="text-xs text-green-700 bg-green-50 rounded-full px-2 py-0.5">{completedCount} completed</span>}
                  {processingCount > 0 && <span className="text-xs text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">{processingCount} processing</span>}
                  {failedCount > 0     && <span className="text-xs text-red-700 bg-red-50 rounded-full px-2 py-0.5">{failedCount} failed</span>}
                </div>
              )}
            </div>
            {data && data.totalPages > 1 && (
              <p className="text-xs text-gray-400">Page {data.page} of {data.totalPages}</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Call Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Analysis Head</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Scenario</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Transcript</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!data || data.calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      {loading ? (
                        <div className="flex flex-col items-center gap-3">
                          <svg className="h-6 w-6 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-sm text-gray-400">Loading calls…</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <svg className="h-8 w-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <p className="text-sm text-gray-400">No calls found for the selected filters.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  data.calls.flatMap((call) => {
                    const rows = [
                      <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          {call.employee.display_name || call.employee.name}
                        </td>
                        <td className="px-6 py-3.5 text-gray-600 whitespace-nowrap">{formatDate(call.call_datetime)}</td>
                        <td className="px-6 py-3.5 text-gray-600">{call.analysis_head.name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{call.call_scenario.name}</td>
                        <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap font-mono text-xs">{formatDuration(call.duration_seconds)}</td>
                        <td className="px-6 py-3.5"><StatusBadge status={call.transcription_status} /></td>
                        <td className="px-6 py-3.5">
                          {call.transcription_status === 'completed' && call.transcript_text ? (
                            <button
                              type="button"
                              onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                            >
                              {expandedCallId === call.id ? (
                                <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>Hide</>
                              ) : (
                                <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>View</>
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>,
                    ]

                    if (expandedCallId === call.id && call.transcript_text) {
                      rows.push(
                        <tr key={`${call.id}-transcript`}>
                          <td colSpan={7} className="bg-blue-50 px-6 py-4 border-y border-blue-100">
                            <div className="flex items-center gap-2 mb-2">
                              <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{call.file_name}</span>
                              {call.language_detected && (
                                <span className="text-xs text-blue-500 font-normal">[{call.language_detected}]</span>
                              )}
                            </div>
                            <pre className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed font-sans max-h-64 overflow-y-auto bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
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

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="border-t border-gray-100 px-6 py-3.5 flex items-center justify-between">
              <p className="text-xs text-gray-400">{data.total.toLocaleString()} total · page {data.page} of {data.totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Prev
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
