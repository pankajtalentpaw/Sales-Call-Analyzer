import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

type ParsedAnalysis = {
  summary?: string
  overall_score?: number
  outcome?: string
  customer_sentiment?: string
  customer_intent?: string
}

export default async function ReportDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await prisma.uploadBatch.findUnique({
    where: { id },
    include: {
      employee: { select: { display_name: true, name: true } },
      analysis_head: { select: { name: true } },
      call_scenario: { select: { name: true } },
      calls: { orderBy: { created_at: 'asc' } },
    },
  })

  if (!batch) notFound()

  const calls = batch.calls.map((call) => ({
    id: call.id,
    fileName: call.file_name,
    duration: call.duration_seconds,
    transcriptionStatus: call.transcription_status,
    analysisStatus: call.analysis_status,
    analysis: parseAnalysis(call.analysis_text),
  }))
  const completedTranscripts = calls.filter((call) => call.transcriptionStatus === 'completed').length
  const completedAnalyses = calls.filter((call) => call.analysisStatus === 'completed').length
  const scores = calls
    .map((call) => call.analysis?.overall_score)
    .filter((score): score is number => typeof score === 'number')
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null
  const reportReady = batch.report_status === 'completed' && Boolean(batch.report_text)
  const reportPdfUrl = `/api/upload-batches/${batch.id}/report-pdf`

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Sales Call Analyzer</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Analysis Report Dashboard</h1>
            <p className="mt-2 text-sm text-gray-500">
              {batch.employee.display_name || batch.employee.name} - {formatDate(batch.batch_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
            >
              Upload New Calls
            </a>
            <a
              href={reportPdfUrl}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                reportReady ? 'bg-blue-600 hover:bg-blue-700' : 'pointer-events-none bg-gray-300'
              }`}
              aria-disabled={!reportReady}
            >
              Download PDF
            </a>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Metric label="Total Calls" value={String(batch.total_files)} />
          <Metric label="Transcripts Ready" value={`${completedTranscripts}/${batch.total_files}`} />
          <Metric label="Analysis Done" value={`${completedAnalyses}/${batch.total_files}`} />
          <Metric label="Average Score" value={averageScore === null ? '-' : `${averageScore}/100`} />
          <Metric label="Report Status" value={titleCase(batch.report_status)} tone={reportReady ? 'good' : 'neutral'} />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <InfoItem label="Employee" value={batch.employee.display_name || batch.employee.name} />
          <InfoItem label="Master Analysis Head" value={batch.analysis_head.name} />
          <InfoItem label="Call Scenario" value={batch.call_scenario.name} />
          <InfoItem label="Generated At" value={batch.report_generated_at ? formatDateTime(batch.report_generated_at) : '-'} />
        </section>

        {!reportReady && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Report abhi ready nahi hai. Transcription aur analysis complete hone ke baad PDF download active hoga.
          </div>
        )}

        <section className="mb-8 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Call Wise Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">File</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                  <th className="px-5 py-3 font-medium">Sentiment</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {calls.map((call) => (
                  <tr key={call.id}>
                    <td className="max-w-xs truncate px-5 py-3 font-medium text-gray-900">{call.fileName}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {typeof call.analysis?.overall_score === 'number' ? `${call.analysis.overall_score}/100` : '-'}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatCell(call.analysis?.outcome)}</td>
                    <td className="px-5 py-3 text-gray-700">{formatCell(call.analysis?.customer_sentiment)}</td>
                    <td className="px-5 py-3 text-gray-700">{formatDuration(call.duration)}</td>
                    <td className="px-5 py-3">
                      <span className={statusClass(call.analysisStatus)}>
                        {titleCase(call.analysisStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Final Report</h2>
              <p className="mt-1 text-sm text-gray-500">Gemini generated analysis, formatted for review.</p>
            </div>
            {reportReady && (
              <a href={reportPdfUrl} className="text-sm font-medium text-blue-600 hover:underline">
                Download PDF
              </a>
            )}
          </div>
          <div className="px-5 py-5">
            {reportReady ? (
              <ReportMarkdown text={batch.report_text ?? ''} />
            ) : (
              <p className="text-sm text-gray-500">Report content available nahi hai.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone === 'good' ? 'text-green-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

function ReportMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text)

  return (
    <div className="space-y-4 text-sm leading-6 text-gray-700">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
          return <Tag key={index} className="pt-2 text-lg font-semibold text-gray-900">{block.text}</Tag>
        }

        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ul>
          )
        }

        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? 'bg-gray-50 font-medium text-gray-900' : ''}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 align-top">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        return <p key={index}>{block.text}</p>
      })}
    </div>
  )
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: cleanMarkdown(heading[2]) })
      index += 1
      continue
    }

    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        const row = lines[index].trim()
        if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row)) {
          rows.push(row.split('|').map((cell) => cleanMarkdown(cell.trim())).filter(Boolean))
        }
        index += 1
      }
      if (rows.length > 0) blocks.push({ type: 'table', rows })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(cleanMarkdown(lines[index].trim().replace(/^[-*]\s+/, '')))
        index += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index].trim()) &&
      !/^[-*]\s+/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith('|')
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: cleanMarkdown(paragraph.join(' ')) })
  }

  return blocks
}

function parseAnalysis(value: string | null): ParsedAnalysis | null {
  if (!value) return null
  try {
    return JSON.parse(value) as ParsedAnalysis
  } catch {
    return null
  }
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
}

function statusClass(status: string): string {
  const base = 'inline-flex rounded-full px-2.5 py-1 text-xs font-medium'
  if (status === 'completed') return `${base} bg-green-50 text-green-700`
  if (status === 'failed') return `${base} bg-red-50 text-red-700`
  if (status === 'processing') return `${base} bg-blue-50 text-blue-700`
  return `${base} bg-gray-100 text-gray-700`
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value: Date): string {
  return value.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return '-'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatCell(value?: string): string {
  return value ? titleCase(value) : '-'
}
