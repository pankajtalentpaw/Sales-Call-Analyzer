'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Employee = { id: string; display_name: string }
type AnalysisHead = { id: string; name: string }
type CallScenario = { id: string; name: string }
type UploadBatchResult = {
  batchId: string
  totalFiles: number
  completedFiles?: number
  failedFiles?: number
  reportStatus?: string
  reportError?: string
  reportUrl?: string
  reportDashboardUrl?: string
  reportPdfUrl?: string
  reportText?: string
}

type BatchStatusResponse = {
  total_files: number
  completed_files: number
  failed_files: number
  report_status?: string
  report_file_url?: string
  report_dashboard_url?: string | null
  report_pdf_url?: string | null
  report_error?: string | null
}

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/ogg',
  'application/octet-stream',
])
const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'mpeg', 'mpga', 'wav', 'm4a', 'aac', 'ogg'])
const MAX_AUDIO_FILES = 15
const today = () => new Date().toISOString().split('T')[0]
const fmtSize = (n: number) => (n < 1e6 ? `${(n / 1e3).toFixed(0)} KB` : `${(n / 1e6).toFixed(1)} MB`)
const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const isAllowedAudioFile = (file: File) =>
  ALLOWED_AUDIO_EXTENSIONS.has(fileExtension(file.name)) ||
  ALLOWED_AUDIO_MIME_TYPES.has(file.type)

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

export default function UploadPage() {
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [analysisHeads, setAnalysisHeads] = useState<AnalysisHead[]>([])
  const [callScenarios, setCallScenarios] = useState<CallScenario[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)

  const [analysisHeadId, setAnalysisHeadId] = useState('')
  const [callScenarioId, setCallScenarioId] = useState('')
  const [callDate, setCallDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [uploadedBatch, setUploadedBatch] = useState<UploadBatchResult | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => r.json()),
      fetch('/api/analysis-heads').then((r) => r.json()),
    ]).then(([meData, heads]) => {
      if (meData?.employee) setEmployee(meData.employee)
      setAnalysisHeads(Array.isArray(heads) ? heads : [])
    })
  }, [])

  useEffect(() => {
    if (!analysisHeadId) {
      setCallScenarios([])
      setCallScenarioId('')
      return
    }
    setLoadingScenarios(true)
    setCallScenarioId('')
    fetch(`/api/call-scenarios?analysis_head_id=${analysisHeadId}`)
      .then((r) => r.json())
      .then((data) => setCallScenarios(Array.isArray(data) ? data : []))
      .finally(() => setLoadingScenarios(false))
  }, [analysisHeadId])

  useEffect(() => {
    if (!uploadedBatch) return

    let cancelled = false
    const refreshBatch = async () => {
      try {
        const res = await fetch(`/api/upload-batches/${uploadedBatch.batchId}`)
        const data = await readJson<BatchStatusResponse>(res)
        if (cancelled || !res.ok || !data) return

        setUploadedBatch((prev) => prev && prev.batchId === uploadedBatch.batchId
          ? {
              ...prev,
              totalFiles: data.total_files,
              completedFiles: data.completed_files,
              failedFiles: data.failed_files,
              reportStatus: data.report_status,
              reportError: data.report_error ?? undefined,
              reportUrl: data.report_file_url ?? prev.reportUrl,
              reportDashboardUrl: data.report_dashboard_url ?? prev.reportDashboardUrl,
              reportPdfUrl: data.report_pdf_url ?? prev.reportPdfUrl,
            }
          : prev)
      } catch {
        // Keep the existing upload success state if the status poll briefly fails.
      }
    }

    void refreshBatch()
    const intervalId = window.setInterval(refreshBatch, 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [uploadedBatch?.batchId])

  const addFiles = useCallback(
    (incoming: File[]) => {
      const invalid = incoming.filter((f) => !isAllowedAudioFile(f))
      if (invalid.length > 0) {
        setErrors((e) => ({ ...e, files: `Unsupported format: ${invalid.map((f) => f.name).join(', ')}. Use MP3, MPEG, WAV, M4A, AAC, or OGG.` }))
        return
      }
      const combined = [...files, ...incoming]
      if (combined.length > MAX_AUDIO_FILES) {
        setErrors((e) => ({ ...e, files: `Maximum ${MAX_AUDIO_FILES} files. Extra files were not added.` }))
        setFiles(combined.slice(0, MAX_AUDIO_FILES))
        return
      }
      setFiles(combined)
      setErrors((e) => ({ ...e, files: '' }))
    },
    [files],
  )

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length) addFiles(selected)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const removeFile = (index: number) => {
    setFiles((f) => f.filter((_, i) => i !== index))
    setErrors((e) => ({ ...e, files: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errs: Record<string, string> = {}
    if (!employee) errs.employee = 'You must be logged in'
    if (!analysisHeadId) errs.head = 'Select a Master Analysis Head'
    if (!callScenarioId) errs.scenario = 'Select a Call Scenario'
    if (!callDate) errs.date = 'Select a call date'
    if (files.length === 0) errs.files = 'Upload at least one audio file'

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    setResult(null)
    setUploadedBatch(null)

    const fd = new FormData()
    if (employee) fd.append('employee_id', employee.id)
    fd.append('analysis_head_id', analysisHeadId)
    fd.append('call_scenario_id', callScenarioId)
    fd.append('call_date', callDate)
    if (notes.trim()) fd.append('notes', notes.trim())
    files.forEach((f) => fd.append('files', f))

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await readJson<{ error?: string; batch_id?: string; total_files?: number }>(res)
      if (!res.ok) {
        setResult({ ok: false, message: data?.error ?? 'Upload failed. Please try again.' })
      } else {
        const batchId = data?.batch_id
        if (batchId) {
          setUploadedBatch({
            batchId,
            totalFiles: data?.total_files ?? files.length,
            completedFiles: 0,
            failedFiles: 0,
            reportStatus: 'pending',
          })
        }
        setResult({
          ok: true,
          message: `${data?.total_files ?? files.length} file(s) uploaded successfully. Transcription is running in the background.`,
        })
        setAnalysisHeadId('')
        setCallScenarioId('')
        setCallDate(today())
        setNotes('')
        setFiles([])
        setErrors({})
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please check your connection and try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateReport = async () => {
    if (!uploadedBatch) return

    const completedFiles = uploadedBatch.completedFiles ?? 0
    const failedFiles = uploadedBatch.failedFiles ?? 0
    if (completedFiles < uploadedBatch.totalFiles || failedFiles > 0) {
      setResult({
        ok: false,
        message: failedFiles > 0
          ? `${failedFiles} file(s) failed transcription. Re-upload those files before generating the report.`
          : `Transcription is still running (${completedFiles}/${uploadedBatch.totalFiles} completed).`,
      })
      return
    }

    setGeneratingReport(true)
    setResult({ ok: true, message: 'Generating analysis report. If transcription is still running, this will tell you the current status.' })

    try {
      const res = await fetch(`/api/upload-batches/${uploadedBatch.batchId}/generate-report`, { method: 'POST' })
      const data = await readJson<{
        error?: string
        report_file_url?: string
        report_dashboard_url?: string
        report_pdf_url?: string
        report_text?: string
        completed_transcripts?: number
        failed_transcripts?: number
        total_files?: number
        report_status?: string
      }>(res)

      if (!res.ok) {
        if (data?.completed_transcripts !== undefined || data?.failed_transcripts !== undefined) {
          setUploadedBatch((prev) => prev ? {
            ...prev,
            completedFiles: data.completed_transcripts ?? prev.completedFiles,
            failedFiles: data.failed_transcripts ?? prev.failedFiles,
            reportStatus: data.report_status ?? prev.reportStatus,
          } : prev)
        }
        const statusText =
          data?.completed_transcripts !== undefined && data?.total_files !== undefined
            ? ` (${data.completed_transcripts}/${data.total_files} transcripts ready)`
            : ''
        setResult({ ok: false, message: `${data?.error ?? 'Report generation failed'}${statusText}` })
        return
      }

      setUploadedBatch((prev) => prev ? {
        ...prev,
        reportUrl: data?.report_file_url,
        reportDashboardUrl: data?.report_dashboard_url ?? `/reports/${prev.batchId}`,
        reportPdfUrl: data?.report_pdf_url ?? `/api/upload-batches/${prev.batchId}/report-pdf`,
        reportText: data?.report_text,
        reportStatus: 'completed',
      } : prev)
      setResult({ ok: true, message: 'Analysis report generated successfully.' })
      window.location.href = data?.report_dashboard_url ?? `/reports/${uploadedBatch.batchId}`
    } catch {
      setResult({ ok: false, message: 'Network error while generating report. Please try again.' })
    } finally {
      setGeneratingReport(false)
    }
  }

  const uploadedCompletedFiles = uploadedBatch?.completedFiles ?? 0
  const uploadedFailedFiles = uploadedBatch?.failedFiles ?? 0
  const transcriptsReady = Boolean(
    uploadedBatch && uploadedCompletedFiles >= uploadedBatch.totalFiles && uploadedFailedFiles === 0,
  )
  const reportButtonText = uploadedFailedFiles > 0
    ? 'Transcription Failed'
    : !transcriptsReady
      ? 'Waiting for Transcripts'
      : generatingReport
        ? 'Generating...'
        : 'Generate Analysis Report'
  const transcriptProgress = uploadedBatch?.totalFiles
    ? Math.min(100, Math.round((uploadedCompletedFiles / uploadedBatch.totalFiles) * 100))
    : 0
  const processingTitle = uploadedBatch?.reportUrl
    ? 'Analysis Report Ready'
    : uploadedFailedFiles > 0
      ? 'Transcription Failed'
      : generatingReport
        ? 'Generating Analysis Report'
        : transcriptsReady
          ? 'Transcription Completed'
          : 'Processing Transcription'
  const processingMessage = uploadedBatch?.reportUrl
    ? 'Your report has been generated successfully.'
    : uploadedFailedFiles > 0
      ? 'Some audio files failed transcription. Please upload those files again.'
      : generatingReport
        ? 'Gemini is preparing the final call analysis report.'
        : transcriptsReady
          ? 'All transcripts are ready. Generate the final analysis report now.'
          : 'Audio transcription is running in the background.'

  const handleStartNewBatch = () => {
    setUploadedBatch(null)
    setResult(null)
    setGeneratingReport(false)
  }
  const reportDashboardUrl = uploadedBatch?.reportDashboardUrl ?? (uploadedBatch ? `/reports/${uploadedBatch.batchId}` : '#')
  const reportPdfUrl = uploadedBatch?.reportPdfUrl ?? (uploadedBatch ? `/api/upload-batches/${uploadedBatch.batchId}/report-pdf` : '#')

  if (uploadedBatch) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  AI
                </div>
                <span className="font-semibold text-gray-900">Sales Dashboard</span>
              </div>
              <nav className="hidden sm:flex items-center gap-1">
                <a href="/" className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">Upload</a>
                <a href="/calls" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">Call Library</a>
                <a href="/analyze" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">Analyze</a>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {employee ? `Logged in as ${employee.display_name}` : 'Loading...'}
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
        <div className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            {uploadedBatch.reportUrl || (transcriptsReady && !generatingReport) ? (
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : uploadedFailedFiles > 0 ? (
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            ) : (
              <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900">{processingTitle}</h1>
          <p className="mt-2 text-sm text-gray-500">{processingMessage}</p>

          <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Transcript progress</span>
              <span className="text-gray-500">
                {uploadedCompletedFiles}/{uploadedBatch.totalFiles}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  uploadedFailedFiles > 0 ? 'bg-red-500' : 'bg-blue-600'
                }`}
                style={{ width: `${transcriptProgress}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-gray-500">
              {uploadedBatch.totalFiles} audio file(s) uploaded
              {uploadedFailedFiles > 0 ? `, ${uploadedFailedFiles} failed` : ''}
            </p>
          </div>

          {result && (
            <div
              className={`mt-5 rounded-lg px-4 py-3 text-left text-sm border ${
                result.ok
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {result.message}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {uploadedBatch.reportUrl ? (
              <>
                <a
                  href={reportDashboardUrl}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  View Report Dashboard
                </a>
                <a
                  href={reportPdfUrl}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Download PDF
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={generatingReport || !transcriptsReady}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reportButtonText}
              </button>
            )}
            {(uploadedBatch.reportUrl || uploadedFailedFiles > 0) && (
              <button
                type="button"
                onClick={handleStartNewBatch}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Upload New Batch
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                AI
              </div>
              <span className="font-semibold text-gray-900">Sales Dashboard</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1">
              <a href="/" className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">Upload</a>
              <a href="/calls" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">Call Library</a>
              <a href="/analyze" className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors">Analyze</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {employee ? `Logged in as ${employee.display_name}` : 'Loading...'}
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

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Upload Sales Calls</h1>
          <p className="mt-1 text-sm text-gray-500">
            Select a call context, then upload your audio files for transcription.
          </p>
        </div>

        {result && (
          <div
            className={`mb-6 rounded-lg px-4 py-3 text-sm border ${
              result.ok
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {result.message}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100"
        >
          <div className="p-6 space-y-5">
            {errors.employee && (
               <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{errors.employee}</div>
            )}
            {/* Master Analysis Head */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Master Analysis Head <span className="text-red-500">*</span>
              </label>
              {analysisHeads.length === 0 ? (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-md px-3 py-2">
                  No analysis heads configured. Contact admin.
                </p>
              ) : (
                <select
                  value={analysisHeadId}
                  onChange={(e) => {
                    setAnalysisHeadId(e.target.value)
                    setErrors((er) => ({ ...er, head: '' }))
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Select analysis head —</option>
                  {analysisHeads.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.head && <p className="mt-1 text-xs text-red-500">{errors.head}</p>}
            </div>

            {/* Call Scenario */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Call Scenario <span className="text-red-500">*</span>
              </label>
              <select
                value={callScenarioId}
                onChange={(e) => {
                  setCallScenarioId(e.target.value)
                  setErrors((er) => ({ ...er, scenario: '' }))
                }}
                disabled={!analysisHeadId || loadingScenarios}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {!analysisHeadId
                    ? '— Select analysis head first —'
                    : loadingScenarios
                      ? 'Loading...'
                      : '— Select scenario —'}
                </option>
                {callScenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {analysisHeadId && !loadingScenarios && callScenarios.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No scenarios configured for this analysis head. Contact admin.
                </p>
              )}
              {errors.scenario && <p className="mt-1 text-xs text-red-500">{errors.scenario}</p>}
            </div>

            {/* Call Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Call Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={callDate}
                max={today()}
                onChange={(e) => {
                  setCallDate(e.target.value)
                  setErrors((er) => ({ ...er, date: '' }))
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
            </div>
          </div>

          {/* File Upload */}
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio Files <span className="text-red-500">*</span>
              <span className="ml-2 font-normal text-gray-400 text-xs">Up to 15 files - MP3, MPEG, WAV, M4A, AAC, OGG</span>
            </label>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-colors select-none ${
                isDragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <svg
                className="mx-auto h-10 w-10 text-gray-300 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <p className="text-sm text-gray-500">Drop audio files here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">{files.length} / {MAX_AUDIO_FILES} selected</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp3,.mpeg,.mpga,.wav,.m4a,.aac,.ogg,audio/*"
              onChange={handleFileInputChange}
              className="sr-only"
            />

            {errors.files && <p className="mt-2 text-xs text-red-500">{errors.files}</p>}

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm text-gray-700 truncate min-w-0">{f.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{fmtSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors"
                      aria-label={`Remove ${f.name}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notes */}
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes for this upload batch..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit */}
          <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Uploading...
                </>
              ) : (
                'Upload Calls'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
