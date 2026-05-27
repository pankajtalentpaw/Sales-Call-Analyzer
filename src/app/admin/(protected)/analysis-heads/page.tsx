'use client'

import { useState, useEffect } from 'react'

type AnalysisHead = {
  id: string
  name: string
  description: string | null
  status: string
}

type ApiError = { error?: string }

const emptyForm = { name: '', description: '' }

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

function isApiError(data: unknown): data is ApiError {
  return typeof data === 'object' && data !== null && 'error' in data
}

function isAnalysisHead(data: unknown): data is AnalysisHead {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'name' in data &&
    'status' in data
  )
}

export default function AnalysisHeadsPage() {
  const [heads, setHeads] = useState<AnalysisHead[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadHeads() {
      try {
        const res = await fetch('/api/admin/analysis-heads')
        const data = await readJson<AnalysisHead[] | ApiError>(res)

        if (ignore) return

        if (!res.ok) {
          setError((data as ApiError | null)?.error ?? 'Failed to load analysis heads')
          return
        }

        if (!Array.isArray(data)) {
          setError('Failed to load analysis heads')
          return
        }

        setHeads(data)
      } catch {
        if (!ignore) setError('Failed to load analysis heads')
      }
    }

    loadHeads()

    return () => {
      ignore = true
    }
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/analysis-heads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    let data: AnalysisHead | ApiError | null
    try {
      data = await readJson<AnalysisHead | ApiError>(res)
    } catch {
      setSaving(false)
      setError('Failed to add analysis head')
      return
    }
    setSaving(false)
    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Failed to add analysis head' : 'Failed to add analysis head')
      return
    }
    if (!isAnalysisHead(data)) { setError('Failed to add analysis head'); return }
    setHeads((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setAddForm(emptyForm)
    setShowAdd(false)
  }

  const startEdit = (head: AnalysisHead) => {
    setEditId(head.id)
    setEditForm({ name: head.name, description: head.description ?? '' })
    setError('')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    setError('')
    setSaving(true)
    const res = await fetch(`/api/admin/analysis-heads/${editId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    let data: AnalysisHead | ApiError | null
    try {
      data = await readJson<AnalysisHead | ApiError>(res)
    } catch {
      setSaving(false)
      setError('Failed to update analysis head')
      return
    }
    setSaving(false)
    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Failed to update analysis head' : 'Failed to update analysis head')
      return
    }
    if (!isAnalysisHead(data)) { setError('Failed to update analysis head'); return }
    setHeads((prev) => prev.map((h) => (h.id === editId ? data : h)))
    setEditId(null)
  }

  const toggleStatus = async (head: AnalysisHead) => {
    const newStatus = head.status === 'active' ? 'inactive' : 'active'
    setHeads((prev) => prev.map((h) => (h.id === head.id ? { ...h, status: newStatus } : h)))
    const res = await fetch(`/api/admin/analysis-heads/${head.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) setHeads((prev) => prev.map((h) => (h.id === head.id ? { ...h, status: head.status } : h)))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analysis Heads</h1>
          <p className="text-sm text-gray-500 mt-0.5">Broad product/campaign categories (e.g. CFO Yantra, AI Course).</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setError('') }}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add Analysis Head'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Analysis Head</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. CFO Yantra" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? 'Saving...' : 'Add Analysis Head'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['Name', 'Description', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {heads.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No analysis heads yet.</td></tr>
              )}
              {heads.map((head) => (
                <tr key={head.id} className="hover:bg-gray-50">
                  {editId === head.id ? (
                    <td colSpan={3} className="px-4 py-3">
                      <form onSubmit={handleEdit} className="flex items-end gap-3">
                        <div><label className="block text-xs text-gray-500 mb-1">Name *</label><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Description</label><input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" /></div>
                        <div className="flex gap-2 pb-0.5">
                          <button type="submit" disabled={saving} className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? '...' : 'Save'}</button>
                          <button type="button" onClick={() => setEditId(null)} className="border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-gray-900">{head.name}</td>
                      <td className="px-4 py-3 text-gray-500">{head.description ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${head.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {head.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </>
                  )}
                  {editId !== head.id && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(head)} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        <button onClick={() => toggleStatus(head)} className={`text-xs font-medium ${head.status === 'active' ? 'text-gray-500 hover:text-red-500' : 'text-green-600 hover:text-green-700'}`}>
                          {head.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
