'use client'

import { useState, useEffect, useRef } from 'react'

type MasterFile = {
  id: string
  title: string
  version: string
  scope: string
  analysis_head_id: string | null
  analysis_head: { name: string } | null
  file_url: string
  is_active: boolean
  created_at: string
}

type AnalysisHead = { id: string; name: string }

type ApiError = { error?: string }

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

function isApiError(data: unknown): data is ApiError {
  return typeof data === 'object' && data !== null && 'error' in data
}

function isMasterFile(data: unknown): data is MasterFile {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'title' in data &&
    'version' in data &&
    'scope' in data
  )
}

export default function MasterFilesPage() {
  const [files, setFiles] = useState<MasterFile[]>([])
  const [activeHeads, setActiveHeads] = useState<AnalysisHead[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [scope, setScope] = useState<'global' | 'head-specific'>('global')
  const [form, setForm] = useState({ title: '', version: '', analysis_head_id: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ignore = false

    async function loadFiles() {
      try {
        const res = await fetch('/api/admin/master-files')
        const data = await readJson<MasterFile[] | ApiError>(res)
        if (ignore) return

        if (!res.ok) {
          setError(isApiError(data) ? data.error ?? 'Failed to load master files' : 'Failed to load master files')
          return
        }

        if (!Array.isArray(data)) {
          setError('Failed to load master files')
          return
        }

        setFiles(data)
      } catch {
        if (!ignore) setError('Failed to load master files')
      }
    }

    async function loadHeads() {
      try {
        const res = await fetch('/api/analysis-heads')
        const data = await readJson<AnalysisHead[] | ApiError>(res)
        if (ignore) return

        if (!res.ok || !Array.isArray(data)) {
          setError(isApiError(data) ? data.error ?? 'Failed to load analysis heads' : 'Failed to load analysis heads')
          return
        }

        setActiveHeads(data)
      } catch {
        if (!ignore) setError('Failed to load analysis heads')
      }
    }

    loadFiles()
    loadHeads()

    return () => {
      ignore = true
    }
  }, [])

  const refreshFiles = async () => {
    try {
      const res = await fetch('/api/admin/master-files')
      const data = await readJson<MasterFile[] | ApiError>(res)
      if (!res.ok || !Array.isArray(data)) {
        setError(isApiError(data) ? data.error ?? 'Failed to refresh master files' : 'Failed to refresh master files')
        return
      }
      setFiles(data)
    } catch {
      setError('Failed to refresh master files')
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedFile) { setError('Please select a file'); return }
    setUploading(true)

    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('version', form.version)
    fd.append('scope', scope)
    if (scope === 'head-specific') fd.append('analysis_head_id', form.analysis_head_id)
    fd.append('file', selectedFile)

    let res: Response
    let data: MasterFile | ApiError | null
    try {
      res = await fetch('/api/admin/master-files', { method: 'POST', body: fd })
      data = await readJson<MasterFile | ApiError>(res)
    } catch {
      setUploading(false)
      setError('Upload failed. Please try again.')
      return
    }
    setUploading(false)

    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Upload failed. Please try again.' : 'Upload failed. Please try again.')
      return
    }
    if (!isMasterFile(data)) { setError('Upload failed. Please try again.'); return }
    setFiles((prev) => [data, ...prev])
    setForm({ title: '', version: '', analysis_head_id: '' })
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setScope('global')
    setShowUpload(false)
  }

  const setActive = async (file: MasterFile) => {
    // Optimistic update
    setFiles((prev) =>
      prev.map((f) => {
        if (f.scope !== file.scope) return f
        if (file.scope === 'head-specific' && f.analysis_head_id !== file.analysis_head_id) return f
        return { ...f, is_active: f.id === file.id }
      })
    )
    const res = await fetch(`/api/admin/master-files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    })
    if (!res.ok) {
      // Revert
      refreshFiles()
    }
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Master Files</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gemini analysis instruction documents. One active file per scope is used automatically.</p>
        </div>
        <button
          onClick={() => { setShowUpload(!showUpload); setError('') }}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showUpload ? 'Cancel' : '+ Upload Master File'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

      {showUpload && (
        <form onSubmit={handleUpload} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload New Master File</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Sales QA Pillars v1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Version *</label>
              <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. v1.0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scope *</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" checked={scope === 'global'} onChange={() => setScope('global')} className="accent-blue-600" /> Global
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" checked={scope === 'head-specific'} onChange={() => setScope('head-specific')} className="accent-blue-600" /> Head-Specific
                </label>
              </div>
            </div>
            {scope === 'head-specific' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Analysis Head *</label>
                <select value={form.analysis_head_id} onChange={(e) => setForm((f) => ({ ...f, analysis_head_id: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— Select —</option>
                  {activeHeads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}
            <div className={scope === 'head-specific' ? '' : 'col-span-2'}>
              <label className="block text-xs font-medium text-gray-600 mb-1">File * <span className="text-gray-400 font-normal">(.txt or .docx)</span></label>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.docx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-3 file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium file:rounded file:px-2 file:py-1 file:cursor-pointer"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={uploading} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['Title', 'Version', 'Scope', 'Analysis Head', 'Status', 'Uploaded', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No master files uploaded yet.</td></tr>
              )}
              {files.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.title}</td>
                  <td className="px-4 py-3 text-gray-600">{f.version}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${f.scope === 'global' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {f.scope === 'global' ? 'Global' : 'Head-Specific'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{f.analysis_head?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${f.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {f.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(f.created_at)}</td>
                  <td className="px-4 py-3">
                    {!f.is_active && (
                      <button onClick={() => setActive(f)} className="text-xs text-blue-600 hover:underline font-medium">
                        Set Active
                      </button>
                    )}
                    {f.is_active && <span className="text-xs text-gray-400">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
