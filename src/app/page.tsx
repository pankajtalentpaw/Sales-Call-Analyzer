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

type UploadQueueStatus = 'ready' | 'uploading' | 'uploaded' | 'failed'

type UploadQueueItem = {
  id: string
  employeeId: string
  employeeName: string
  analysisHeadId: string
  analysisHeadName: string
  callScenarioId: string
  callScenarioName: string
  callDate: string
  notes: string
  files: File[]
  status: UploadQueueStatus
  batchId?: string
  error?: string
}

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
  'audio/ogg', 'application/octet-stream',
])
const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'mpeg', 'mpga', 'wav', 'm4a', 'aac', 'ogg'])
const MAX_AUDIO_FILES = 15

const today = () => new Date().toISOString().split('T')[0]
const fmtSize = (n: number) => n < 1e6 ? `${(n / 1e3).toFixed(0)} KB` : `${(n / 1e6).toFixed(1)} MB`
const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const isAllowedAudioFile = (file: File) =>
  ALLOWED_AUDIO_EXTENSIONS.has(fileExtension(file.name)) || ALLOWED_AUDIO_MIME_TYPES.has(file.type)
const createQueueItemId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

const QUEUE_STATUS_CONFIG: Record<UploadQueueStatus, { label: string; cls: string }> = {
  ready:     { label: 'Ready',     cls: 'bg-gray-100 text-gray-600' },
  uploading: { label: 'Uploading', cls: 'bg-blue-50 text-blue-700' },
  uploaded:  { label: 'Uploaded',  cls: 'bg-green-50 text-green-700' },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-700' },
}

export default function UploadPage() {
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [analysisHeads, setAnalysisHeads] = useState<AnalysisHead[]>([])
  const [callScenarios, setCallScenarios] = useState<CallScenario[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)

  const [employeeId, setEmployeeId] = useState('')
  const [analysisHeadId, setAnalysisHeadId] = useState('')
  const [callScenarioId, setCallScenarioId] = useState('')
  const [callDate, setCallDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploadItems, setUploadItems] = useState<UploadQueueItem[]>([])
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
      fetch('/api/employees').then((r) => r.json()),
    ]).then(([meData, heads, employeeList]) => {
      if (meData?.employee) { setEmployee(meData.employee); setEmployeeId(meData.employee.id) }
      setAnalysisHeads(Array.isArray(heads) ? heads : [])
      setEmployees(Array.isArray(employeeList) ? employeeList : [])
    })
  }, [])

  useEffect(() => {
    if (!analysisHeadId) { setCallScenarios([]); setCallScenarioId(''); return }
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
          ? { ...prev,
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
      } catch { /* keep existing state if poll briefly fails */ }
    }
    void refreshBatch()
    const intervalId = window.setInterval(refreshBatch, 5000)
    return () => { cancelled = true; window.clearInterval(intervalId) }
  }, [uploadedBatch?.batchId])

  const addFiles = useCallback((incoming: File[]) => {
    const invalid = incoming.filter((f) => !isAllowedAudioFile(f))
    if (invalid.length > 0) {
      setErrors((e) => ({ ...e, files: `Unsupported format: ${invalid.map((f) => f.name).join(', ')}. Use MP3, WAV, M4A, AAC, or OGG.` }))
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
  }, [files])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length) addFiles(selected)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const removeFile = (index: number) => {
    setFiles((f) => f.filter((_, i) => i !== index))
    setErrors((e) => ({ ...e, files: '' }))
  }

  const buildUploadItemFromForm = (): UploadQueueItem | null => {
    const errs: Record<string, string> = {}
    const selectedEmployee = employees.find((emp) => emp.id === employeeId) ?? (employee?.id === employeeId ? employee : null)
    const selectedHead = analysisHeads.find((head) => head.id === analysisHeadId)
    const selectedScenario = callScenarios.find((scenario) => scenario.id === callScenarioId)

    if (!selectedEmployee) errs.employee = 'Select an employee'
    if (!selectedHead) errs.head = 'Select a Master Analysis Head'
    if (!selectedScenario) errs.scenario = 'Select a Call Scenario'
    if (!callDate) errs.date = 'Select a call date'
    if (files.length === 0) errs.files = 'Upload at least one audio file'

    if (Object.keys(errs).length > 0 || !selectedEmployee || !selectedHead || !selectedScenario) {
      setErrors(errs); return null
    }

    return {
      id: createQueueItemId(),
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.display_name,
      analysisHeadId: selectedHead.id,
      analysisHeadName: selectedHead.name,
      callScenarioId: selectedScenario.id,
      callScenarioName: selectedScenario.name,
      callDate,
      notes: notes.trim(),
      files: [...files],
      status: 'ready',
    }
  }

  const buildUploadFormData = (item: UploadQueueItem) => {
    const fd = new FormData()
    fd.append('employee_id', item.employeeId)
    fd.append('analysis_head_id', item.analysisHeadId)
    fd.append('call_scenario_id', item.callScenarioId)
    fd.append('call_date', item.callDate)
    if (item.notes) fd.append('notes', item.notes)
    item.files.forEach((f) => fd.append('files', f))
    return fd
  }

  const uploadQueueItem = async (item: UploadQueueItem): Promise<UploadBatchResult> => {
    const res = await fetch('/api/upload', { method: 'POST', body: buildUploadFormData(item) })
    const data = await readJson<{ error?: string; batch_id?: string; total_files?: number }>(res)
    if (!res.ok || !data?.batch_id) throw new Error(data?.error ?? 'Upload failed. Please try again.')
    return { batchId: data.batch_id, totalFiles: data.total_files ?? item.files.length, completedFiles: 0, failedFiles: 0, reportStatus: 'pending' }
  }

  const handleAddNew = () => {
    const item = buildUploadItemFromForm()
    if (!item) return
    setUploadItems((current) => [...current, item])
    setFiles([])
    setNotes('')
    setErrors({})
    setResult({ ok: true, message: `${item.files.length} file(s) added to upload queue.` })
  }

  const removeUploadItem = (id: string) => setUploadItems((current) => current.filter((item) => item.id !== id))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const hasQueuedItems = uploadItems.length > 0
    const itemsToUpload = hasQueuedItems
      ? uploadItems.filter((item) => item.status === 'ready' || item.status === 'failed')
      : [buildUploadItemFromForm()].filter((item): item is UploadQueueItem => Boolean(item))

    if (itemsToUpload.length === 0) {
      setResult({ ok: true, message: hasQueuedItems ? 'All items are already uploaded.' : 'Add files before uploading.' })
      return
    }

    setSubmitting(true); setResult(null); setUploadedBatch(null)
    const uploadedResults: UploadBatchResult[] = []
    let failedCount = 0

    try {
      for (const item of itemsToUpload) {
        if (hasQueuedItems) {
          setUploadItems((current) => current.map((ci) =>
            ci.id === item.id ? { ...ci, status: 'uploading', error: undefined } : ci))
        }
        try {
          const uploaded = await uploadQueueItem(item)
          uploadedResults.push(uploaded)
          if (hasQueuedItems) {
            setUploadItems((current) => current.map((ci) =>
              ci.id === item.id ? { ...ci, status: 'uploaded', batchId: uploaded.batchId, error: undefined } : ci))
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed. Please try again.'
          failedCount += 1
          if (hasQueuedItems) {
            setUploadItems((current) => current.map((ci) =>
              ci.id === item.id ? { ...ci, status: 'failed', error: message } : ci))
            continue
          }
          setResult({ ok: false, message }); return
        }
      }

      if (!hasQueuedItems && uploadedResults[0]) {
        setUploadedBatch(uploadedResults[0])
        setResult({ ok: true, message: `${uploadedResults[0].totalFiles} file(s) uploaded. Transcription running in background.` })
        setAnalysisHeadId(''); setCallScenarioId(''); setCallDate(today()); setNotes(''); setFiles([]); setErrors({})
        return
      }

      setResult({
        ok: failedCount === 0,
        message: failedCount === 0
          ? `${uploadedResults.length} batch(es) uploaded. Transcription running in background.`
          : `${uploadedResults.length} uploaded, ${failedCount} failed. Check queue below.`,
      })
      if (uploadedResults.length > 0) { setFiles([]); setNotes(''); setErrors({}) }
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
          ? `${failedFiles} file(s) failed transcription. Re-upload those files first.`
          : `Transcription still running (${completedFiles}/${uploadedBatch.totalFiles} completed).`,
      }); return
    }

    setGeneratingReport(true)
    setResult({ ok: true, message: 'Generating analysis report…' })

    try {
      const res = await fetch(`/api/upload-batches/${uploadedBatch.batchId}/generate-report`, { method: 'POST' })
      const data = await readJson<{
        error?: string; report_file_url?: string; report_dashboard_url?: string
        report_pdf_url?: string; report_text?: string
        completed_transcripts?: number; failed_transcripts?: number
        total_files?: number; report_status?: string
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
        const statusText = data?.completed_transcripts !== undefined && data?.total_files !== undefined
          ? ` (${data.completed_transcripts}/${data.total_files} transcripts ready)` : ''
        setResult({ ok: false, message: `${data?.error ?? 'Report generation failed'}${statusText}` }); return
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
  const uploadedFailedFiles    = uploadedBatch?.failedFiles ?? 0
  const transcriptsReady = Boolean(uploadedBatch && uploadedCompletedFiles >= uploadedBatch.totalFiles && uploadedFailedFiles === 0)
  const transcriptProgress = uploadedBatch?.totalFiles
    ? Math.min(100, Math.round((uploadedCompletedFiles / uploadedBatch.totalFiles) * 100)) : 0
  const reportDashboardUrl = uploadedBatch?.reportDashboardUrl ?? (uploadedBatch ? `/reports/${uploadedBatch.batchId}` : '#')
  const reportPdfUrl = uploadedBatch?.reportPdfUrl ?? (uploadedBatch ? `/api/upload-batches/${uploadedBatch.batchId}/report-pdf` : '#')

  const handleStartNewBatch = () => { setUploadedBatch(null); setResult(null); setGeneratingReport(false) }

  /* ── Shared header ──────────────────────────────────────────────────── */
  const Header = () => (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm select-none">AI</div>
            <span className="font-semibold text-gray-900 text-sm">Sales Dashboard</span>
          </div>
          <nav className="hidden sm:flex items-center gap-0.5">
            <span className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md">Upload</span>
            <a href="/analyze" className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors">Analyze</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {employee && <span className="text-xs text-gray-500 hidden sm:inline">{employee.display_name}</span>}
          <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Logout</button>
        </div>
      </div>
    </header>
  )

  /* ── Post-upload processing view ────────────────────────────────────── */
  if (uploadedBatch) {
    const isReportReady = Boolean(uploadedBatch.reportUrl)
    const hasFailed     = uploadedFailedFiles > 0

    const iconBg  = hasFailed ? 'bg-red-50' : isReportReady || transcriptsReady ? 'bg-green-50' : 'bg-blue-50'
    const icon = hasFailed ? (
      <svg className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ) : isReportReady || (transcriptsReady && !generatingReport) ? (
      <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ) : (
      <svg className="h-7 w-7 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    )

    const statusTitle = isReportReady ? 'Report Ready'
      : hasFailed ? 'Transcription Failed'
      : generatingReport ? 'Generating Report…'
      : transcriptsReady ? 'Transcription Complete'
      : 'Transcribing Audio…'

    const statusDesc = isReportReady ? 'Your analysis report has been generated.'
      : hasFailed ? 'Some files failed transcription. Re-upload those files.'
      : generatingReport ? 'AI is preparing your combined call analysis report.'
      : transcriptsReady ? 'All transcripts ready. Click Generate Report to proceed.'
      : 'ElevenLabs is transcribing your audio files in the background.'

    const generateButtonText = hasFailed ? 'Transcription Failed'
      : !transcriptsReady ? `Waiting… ${uploadedCompletedFiles}/${uploadedBatch.totalFiles}`
      : generatingReport ? 'Generating…'
      : 'Generate Report'

    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Processing Batch</h1>
            <p className="mt-1 text-sm text-gray-500">Batch ID: {uploadedBatch.batchId}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center">
              <p className="text-3xl font-bold text-gray-900">{uploadedBatch.totalFiles}</p>
              <p className="mt-1 text-xs text-gray-500 uppercase tracking-wide">Total Files</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center">
              <p className="text-3xl font-bold text-green-600">{uploadedCompletedFiles}</p>
              <p className="mt-1 text-xs text-gray-500 uppercase tracking-wide">Transcribed</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-center">
              <p className={`text-3xl font-bold ${uploadedFailedFiles > 0 ? 'text-red-500' : 'text-gray-300'}`}>{uploadedFailedFiles}</p>
              <p className="mt-1 text-xs text-gray-500 uppercase tracking-wide">Failed</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-full ${iconBg} flex items-center justify-center mb-5`}>
                {icon}
              </div>
              <h2 className="text-xl font-bold text-gray-900">{statusTitle}</h2>
              <p className="mt-2 text-sm text-gray-500 max-w-sm">{statusDesc}</p>

              <div className="w-full max-w-sm mt-8">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>Transcript progress</span>
                  <span>{transcriptProgress}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hasFailed ? 'bg-red-400' : 'bg-blue-500'}`}
                    style={{ width: `${transcriptProgress}%` }}
                  />
                </div>
              </div>

              {result && (
                <div className={`mt-5 w-full max-w-sm rounded-xl border px-4 py-3 text-sm text-left ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  {result.message}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {isReportReady ? (
                  <>
                    <a href={reportDashboardUrl} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      View Report
                    </a>
                    <a href={reportPdfUrl} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download PDF
                    </a>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={generatingReport || !transcriptsReady || hasFailed}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingReport && (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {generateButtonText}
                  </button>
                )}
                {(isReportReady || hasFailed) && (
                  <button type="button" onClick={handleStartNewBatch} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    Upload New Batch
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Main upload form ───────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Sales Calls</h1>
          <p className="mt-1 text-sm text-gray-500">Select a call context, then upload audio files for transcription.</p>
        </div>

        {result && (
          <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {result.ok
              ? <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              : <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            }
            {result.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Call Context card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Call Context
              </h2>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Employee */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Employee <span className="text-red-400">*</span>
                  </label>
                  {employees.length === 0 ? (
                    <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">No active employees. Contact admin.</p>
                  ) : (
                    <select
                      value={employeeId}
                      onChange={(e) => { setEmployeeId(e.target.value); setErrors((er) => ({ ...er, employee: '' })) }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                    >
                      <option value="">— Select employee —</option>
                      {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.display_name}</option>)}
                    </select>
                  )}
                  {errors.employee && <p className="mt-1 text-xs text-red-500">{errors.employee}</p>}
                </div>

                {/* Analysis Head */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Analysis Head <span className="text-red-400">*</span>
                  </label>
                  {analysisHeads.length === 0 ? (
                    <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">No analysis heads. Contact admin.</p>
                  ) : (
                    <select
                      value={analysisHeadId}
                      onChange={(e) => { setAnalysisHeadId(e.target.value); setErrors((er) => ({ ...er, head: '' })) }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                    >
                      <option value="">— Select analysis head —</option>
                      {analysisHeads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  )}
                  {errors.head && <p className="mt-1 text-xs text-red-500">{errors.head}</p>}
                </div>

                {/* Call Scenario */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Call Scenario <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={callScenarioId}
                    onChange={(e) => { setCallScenarioId(e.target.value); setErrors((er) => ({ ...er, scenario: '' })) }}
                    disabled={!analysisHeadId || loadingScenarios}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">{!analysisHeadId ? '— Select head first —' : loadingScenarios ? 'Loading…' : '— Select scenario —'}</option>
                    {callScenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {analysisHeadId && !loadingScenarios && callScenarios.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">No scenarios for this head. Contact admin.</p>
                  )}
                  {errors.scenario && <p className="mt-1 text-xs text-red-500">{errors.scenario}</p>}
                </div>
              </div>

              {/* Call Date */}
              <div className="max-w-xs">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Call Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={callDate}
                  max={today()}
                  onChange={(e) => { setCallDate(e.target.value); setErrors((er) => ({ ...er, date: '' })) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                />
                {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
              </div>
            </div>
          </div>

          {/* Audio Files card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                Audio Files
                <span className="ml-1 text-xs font-normal text-gray-400">MP3, WAV, M4A, AAC, OGG — up to {MAX_AUDIO_FILES} files</span>
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors select-none ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
              >
                <svg className="mx-auto h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-gray-500">Drop audio files here, or <span className="text-blue-600 font-medium">click to browse</span></p>
                <p className="mt-1 text-xs text-gray-400">{files.length} / {MAX_AUDIO_FILES} selected</p>
              </div>

              <input ref={fileInputRef} type="file" multiple accept=".mp3,.mpeg,.mpga,.wav,.m4a,.aac,.ogg,audio/*" onChange={handleFileInputChange} className="sr-only" />
              {errors.files && <p className="text-xs text-red-500">{errors.files}</p>}

              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <svg className="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <span className="flex-1 text-sm text-gray-700 truncate min-w-0">{f.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{fmtSize(f.size)}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors" aria-label={`Remove ${f.name}`}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Notes card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Notes <span className="text-xs font-normal text-gray-400 ml-1">(optional)</span>
              </h2>
            </div>
            <div className="px-6 py-5">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes for this upload batch…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleAddNew}
              disabled={submitting}
              className="inline-flex items-center gap-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add to Queue
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Upload Calls
                </>
              )}
            </button>
          </div>
        </form>

        {/* Upload Queue */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Upload Queue
            </h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2.5 py-1">{uploadItems.length} item{uploadItems.length !== 1 ? 's' : ''}</span>
          </div>

          {uploadItems.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg className="mx-auto h-8 w-8 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-sm text-gray-400">Queue is empty.</p>
              <p className="mt-1 text-xs text-gray-400">Use <span className="font-medium text-gray-500">Add to Queue</span> to batch multiple employees before uploading.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {uploadItems.map((item, index) => {
                const cfg = QUEUE_STATUS_CONFIG[item.status]
                return (
                  <li key={item.id} className="flex items-start gap-4 px-6 py-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900">{item.employeeName}</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">{item.analysisHeadName} · {item.callScenarioName} · {item.callDate}</p>
                      <p className="mt-0.5 text-xs text-gray-400 truncate">{item.files.length} file(s): {item.files.map((f) => f.name).join(', ')}</p>
                      {item.error && <p className="mt-1 text-xs text-red-500">{item.error}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUploadItem(item.id)}
                      disabled={submitting || item.status === 'uploading'}
                      className="text-gray-300 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors flex-shrink-0"
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
