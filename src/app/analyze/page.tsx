'use client'

import { useState, useEffect } from 'react'

type Employee = { id: string; display_name: string }
type AnalysisHead = { id: string; name: string }
type CallScenario = { id: string; name: string }

type AnalyzeResponse = {
  report?: string
  call_count?: number
  error?: string
}

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
          const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
          return <Tag key={idx} className="pt-2 text-lg font-semibold text-gray-900">{block.text}</Tag>
        }
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
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
                    <tr key={ri} className={ri === 0 ? 'bg-gray-50 font-medium text-gray-900' : ''}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 align-top">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <p key={idx}>{block.text}</p>
      })}
    </div>
  )
}

const todayStr = () => new Date().toISOString().split('T')[0]
const offsetDate = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

const DATE_PRESETS = [
  { label: 'Today', from: () => todayStr(), to: () => todayStr() },
  { label: 'Yesterday', from: () => offsetDate(1), to: () => offsetDate(1) },
  { label: 'Last 2 days', from: () => offsetDate(1), to: () => todayStr() },
  { label: 'Last 5 days', from: () => offsetDate(4), to: () => todayStr() },
]

export default function AnalyzePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [analysisHeads, setAnalysisHeads] = useState<AnalysisHead[]>([])
  const [callScenarios, setCallScenarios] = useState<CallScenario[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterHead, setFilterHead] = useState('')
  const [filterScenario, setFilterScenario] = useState('')
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [activePreset, setActivePreset] = useState<string>('Today')

  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{ report: string; callCount: number } | null>(null)
  const [error, setError] = useState('')

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

  const applyPreset = (preset: typeof DATE_PRESETS[0]) => {
    setDateFrom(preset.from())
    setDateTo(preset.to())
    setActivePreset(preset.label)
  }

  const handleDateFromChange = (v: string) => {
    setDateFrom(v)
    setActivePreset('')
  }

  const handleDateToChange = (v: string) => {
    setDateTo(v)
    setActivePreset('')
  }

  const handleAnalyze = async () => {
    setError('')
    setResult(null)
    setAnalyzing(true)

    try {
      const body: Record<string, string> = { date_from: dateFrom, date_to: dateTo }
      if (filterEmployee) body.employee_id = filterEmployee
      if (filterHead) body.analysis_head_id = filterHead
      if (filterScenario) body.call_scenario_id = filterScenario

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as AnalyzeResponse

      if (!res.ok || data.error) {
        setError(data.error ?? 'Analysis failed. Please try again.')
        return
      }

      if (data.report && data.call_count !== undefined) {
        setResult({ report: data.report, callCount: data.call_count })
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
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
              <a href="/calls" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">
                Call Library
              </a>
              <a href="/analyze" className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">
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

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Analyze Calls</h1>
          <p className="mt-1 text-sm text-gray-500">
            Select filters and generate a fresh combined report from completed transcripts.
          </p>
        </div>

        {/* Filter card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Filters</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.display_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Master Analysis Head</label>
              <select
                value={filterHead}
                onChange={(e) => setFilterHead(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Heads</option>
                {analysisHeads.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Call Scenario</label>
              <select
                value={filterScenario}
                onChange={(e) => setFilterScenario(e.target.value)}
                disabled={!filterHead || loadingScenarios}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">{filterHead ? 'All Scenarios' : '— Select head first —'}</option>
                {callScenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date Range</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                      activePreset === p.label
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  max={todayStr()}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={dateTo}
                  max={todayStr()}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !dateFrom || !dateTo}
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating report...
                </>
              ) : (
                'Analyze'
              )}
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading placeholder */}
        {analyzing && !result && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <svg className="mx-auto h-10 w-10 animate-spin text-blue-500 mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Generating analysis report…</p>
            <p className="mt-1 text-xs text-gray-400">This may take 30–90 seconds depending on call count.</p>
          </div>
        )}

        {/* Empty state */}
        {!analyzing && !result && !error && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
            <svg className="mx-auto h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-400">Select filters above and click Analyze to generate a report.</p>
          </div>
        )}

        {/* Report */}
        {result && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Analysis Report</h2>
                <p className="mt-0.5 text-xs text-gray-500">Based on {result.callCount} completed transcript{result.callCount !== 1 ? 's' : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([result.report], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `analysis-report-${dateFrom}-to-${dateTo}.txt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap"
              >
                Download as text
              </button>
            </div>
            <div className="px-5 py-5">
              <ReportMarkdown text={result.report} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
