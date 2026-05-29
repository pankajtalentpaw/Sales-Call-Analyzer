'use client'

import { useState, useEffect, useRef } from 'react'

type Employee = { id: string; display_name: string }
type AnalysisHead = { id: string; name: string }
type CallScenario = { id: string; name: string }

type AnalyzeResponse = {
  report?: string
  call_count?: number
  error?: string
}
type MeResponse = { employee?: { id: string; display_name?: string; name?: string } }

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }

function cleanMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: cleanMarkdown(heading[2]) })
      i++
      continue
    }

    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim()
        if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row)) {
          rows.push(row.split('|').map((cell) => cleanMarkdown(cell.trim())).filter(Boolean))
        }
        i++
      }
      if (rows.length > 0) blocks.push({ type: 'table', rows })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(cleanMarkdown(lines[i].trim().replace(/^[-*]\s+/, '')))
        i++
      }
      blocks.push({ type: 'list', items })
      continue
    }

    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('|')
    ) {
      paragraph.push(lines[i].trim())
      i++
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', text: cleanMarkdown(paragraph.join(' ')) })
  }

  return blocks
}

function ReportMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text)
  return (
    <div className="space-y-4 text-sm leading-6 text-gray-700">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          if (block.level === 1) return <h2 key={idx} className="pt-4 text-xl font-bold text-gray-900 border-b border-gray-100 pb-2">{block.text}</h2>
          if (block.level === 2) return <h3 key={idx} className="pt-3 text-base font-semibold text-gray-800">{block.text}</h3>
          return <h4 key={idx} className="pt-2 text-sm font-semibold text-gray-700">{block.text}</h4>
        }
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5 text-gray-600">
              {block.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={idx} className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? 'bg-gray-50 font-semibold text-gray-900' : 'hover:bg-gray-50'}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-4 py-2.5 align-top">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <p key={idx} className="text-gray-600">{block.text}</p>
      })}
    </div>
  )
}

function localDatetime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}
function startOfDay(offsetDays = 0): string {
  const d = new Date(); d.setDate(d.getDate() - offsetDays); d.setHours(0, 0, 0, 0); return localDatetime(d)
}
function endOfDay(offsetDays = 0): string {
  const d = new Date(); d.setDate(d.getDate() - offsetDays); d.setHours(23, 59, 0, 0); return localDatetime(d)
}
const nowLocal = () => localDatetime(new Date())

const DATE_PRESETS = [
  { label: 'Today',       from: () => startOfDay(0), to: () => endOfDay(0) },
  { label: 'Yesterday',   from: () => startOfDay(1), to: () => endOfDay(1) },
  { label: 'Last 2 days', from: () => startOfDay(1), to: () => endOfDay(0) },
  { label: 'Last 5 days', from: () => startOfDay(4), to: () => endOfDay(0) },
]
const CUSTOM_PRESET_LABEL = 'Custom'

export default function AnalyzePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null)
  const [authMode, setAuthMode] = useState<'unknown' | 'employee' | 'admin'>('unknown')
  const [analysisHeads, setAnalysisHeads] = useState<AnalysisHead[]>([])
  const [callScenarios, setCallScenarios] = useState<CallScenario[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterHead, setFilterHead] = useState('')
  const [filterScenario, setFilterScenario] = useState('')
  const [dateFrom, setDateFrom] = useState(startOfDay)
  const [dateTo, setDateTo] = useState(endOfDay)
  const [activePreset, setActivePreset] = useState<string>('Today')
  const dateFromRef = useRef<HTMLInputElement>(null)

  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{ report: string; callCount: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/employees').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/analysis-heads').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([meData, emps, heads]: [MeResponse | null, unknown, unknown]) => {
      const sessionEmployee = meData?.employee
        ? {
            id: meData.employee.id,
            display_name: meData.employee.display_name ?? meData.employee.name ?? 'Employee',
          }
        : null

      setCurrentEmployee(sessionEmployee)
      setAuthMode(sessionEmployee ? 'employee' : 'admin')
      setEmployees(sessionEmployee ? [sessionEmployee] : Array.isArray(emps) ? emps : [])
      if (sessionEmployee) setFilterEmployee(sessionEmployee.id)
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

  const applyPreset = (preset: typeof DATE_PRESETS[0]) => {
    setDateFrom(preset.from())
    setDateTo(preset.to())
    setActivePreset(preset.label)
  }

  const handleDateFromChange = (v: string) => { setDateFrom(v); setActivePreset(CUSTOM_PRESET_LABEL) }
  const handleDateToChange   = (v: string) => { setDateTo(v);   setActivePreset(CUSTOM_PRESET_LABEL) }

  const handleCustomPreset = () => {
    setActivePreset(CUSTOM_PRESET_LABEL)
    const input = dateFromRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
    input?.focus()
    input?.showPicker?.()
  }

  const handleAnalyze = async () => {
    setError('')
    setResult(null)
    setAnalyzing(true)

    try {
      const body: Record<string, string> = {
        date_from: new Date(dateFrom).toISOString(),
        date_to:   new Date(dateTo).toISOString(),
      }
      const selectedEmployeeId = currentEmployee?.id ?? filterEmployee
      if (selectedEmployeeId) body.employee_id   = selectedEmployeeId
      if (filterHead)     body.analysis_head_id  = filterHead
      if (filterScenario) body.call_scenario_id  = filterScenario

      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = (await res.json()) as AnalyzeResponse

      if (!res.ok || data.error) { setError(data.error ?? 'Analysis failed. Please try again.'); return }
      if (data.report && data.call_count !== undefined) {
        setResult({ report: data.report, callCount: data.call_count })
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const blob = new Blob([result.report], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `analysis-report-${dateFrom.slice(0, 10)}-to-${dateTo.slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const employeeLabel  = currentEmployee ? currentEmployee.display_name : filterEmployee ? (employees.find(e => e.id === filterEmployee)?.display_name ?? 'Unknown') : 'All Employees'
  const headLabel      = filterHead     ? (analysisHeads.find(h => h.id === filterHead)?.name ?? 'Unknown')          : 'All Heads'
  const scenarioLabel  = filterScenario ? (callScenarios.find(s => s.id === filterScenario)?.name ?? 'Unknown')       : 'All Scenarios'
  const isEmployeeMode = authMode === 'employee'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm select-none">
                AI
              </div>
              <span className="font-semibold text-gray-900 text-sm">Sales Dashboard</span>
            </div>
            <nav className="hidden sm:flex items-center gap-0.5">
              {isEmployeeMode ? (
                <a href="/" className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors">Upload</a>
              ) : (
                <>
                  <a href="/admin"   className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors">Admin</a>
                  <a href="/calls"   className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors">Call Library</a>
                </>
              )}
              <a href="/analyze" className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">Analyze</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {currentEmployee && <span className="hidden sm:inline text-xs text-gray-500">{currentEmployee.display_name}</span>}
            <button
              onClick={async () => {
                await fetch(isEmployeeMode ? '/api/auth/logout' : '/api/admin/auth/logout', { method: 'POST' })
                window.location.href = isEmployeeMode ? '/login' : '/admin/login'
              }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Analysis</h1>
          <p className="mt-1 text-sm text-gray-500">Select filters and click Generate Report to analyse completed transcripts.</p>
        </div>

        {/* Filter + Generate card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filters
            </h2>
          </div>

          <div className="px-6 py-5">
            <div className="grid gap-5 sm:grid-cols-3">
              {/* Employee */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Employee</label>
                {currentEmployee ? (
                  <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-800">
                    {currentEmployee.display_name}
                  </div>
                ) : (
                  <select
                    value={filterEmployee}
                    onChange={(e) => setFilterEmployee(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                  >
                    <option value="">All Employees</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.display_name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Analysis Head */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Analysis Head</label>
                <select
                  value={filterHead}
                  onChange={(e) => setFilterHead(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                >
                  <option value="">All Heads</option>
                  {analysisHeads.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              {/* Call Scenario */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Call Scenario</label>
                <select
                  value={filterScenario}
                  onChange={(e) => setFilterScenario(e.target.value)}
                  disabled={!filterHead || loadingScenarios}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">{filterHead ? 'All Scenarios' : '— Select head first —'}</option>
                  {callScenarios.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date range */}
            <div className="mt-5">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Date Range</label>
              <div className="flex flex-wrap items-center gap-2">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      activePreset === p.label
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleCustomPreset}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    activePreset === CUSTOM_PRESET_LABEL
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  Custom
                </button>
                <div className="flex items-center gap-2 ml-1">
                  <input
                    ref={dateFromRef}
                    type="datetime-local"
                    value={dateFrom}
                    max={nowLocal()}
                    onChange={(e) => handleDateFromChange(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  />
                  <span className="text-gray-300 text-xs">→</span>
                  <input
                    type="datetime-local"
                    value={dateTo}
                    max={nowLocal()}
                    onChange={(e) => handleDateToChange(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Generate button — full-width bottom CTA */}
          <div className="px-6 pb-6">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !dateFrom || !dateTo}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm"
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating report…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
            <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Loading state */}
        {analyzing && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="h-7 w-7 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-800">Analysing calls…</p>
            <p className="mt-1 text-xs text-gray-400">This may take 30–90 seconds depending on call count.</p>
          </div>
        )}

        {/* Empty state — shown before any action */}
        {!analyzing && !result && !error && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm p-14 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="h-7 w-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No report generated yet</p>
            <p className="mt-1 text-xs text-gray-400">Configure your filters above and click <span className="font-semibold text-blue-500">Generate Report</span> to get started.</p>
          </div>
        )}

        {/* Report */}
        {result && !analyzing && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Report header */}
            <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Analysis Report</h2>
                  <p className="text-xs text-gray-400">
                    {result.callCount} call{result.callCount !== 1 ? 's' : ''} · {employeeLabel} · {headLabel} · {scenarioLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>

            {/* Report body */}
            <div className="px-6 py-6">
              <ReportMarkdown text={result.report} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
