'use client'

import { useState, useEffect } from 'react'

type CallScenario = {
  id: string
  analysis_head_id: string
  analysis_head: { name: string }
  name: string
  description: string | null
  status: string
}

type AnalysisHead = { id: string; name: string }

const emptyForm = { analysis_head_id: '', name: '', description: '' }

type ApiError = { error?: string }

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

function isApiError(data: unknown): data is ApiError {
  return typeof data === 'object' && data !== null && 'error' in data
}

function isCallScenario(data: unknown): data is CallScenario {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'analysis_head_id' in data &&
    'analysis_head' in data &&
    'name' in data &&
    'status' in data
  )
}

export default function CallScenariosPage() {
  const [scenarios, setScenarios] = useState<CallScenario[]>([])
  const [activeHeads, setActiveHeads] = useState<AnalysisHead[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadScenarios() {
      try {
        const res = await fetch('/api/admin/call-scenarios')
        const data = await readJson<CallScenario[] | ApiError>(res)
        if (ignore) return

        if (!res.ok || !Array.isArray(data)) {
          setError(isApiError(data) ? data.error ?? 'Failed to load call scenarios' : 'Failed to load call scenarios')
          return
        }

        setScenarios(data)
      } catch {
        if (!ignore) setError('Failed to load call scenarios')
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

    loadScenarios()
    loadHeads()

    return () => {
      ignore = true
    }
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    let res: Response
    let data: CallScenario | ApiError | null
    try {
      res = await fetch('/api/admin/call-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      data = await readJson<CallScenario | ApiError>(res)
    } catch {
      setSaving(false)
      setError('Failed to add call scenario')
      return
    }
    setSaving(false)
    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Failed to add call scenario' : 'Failed to add call scenario')
      return
    }
    if (!isCallScenario(data)) { setError('Failed to add call scenario'); return }
    setScenarios((prev) => [...prev, data])
    setAddForm(emptyForm)
    setShowAdd(false)
  }

  const startEdit = (s: CallScenario) => {
    setEditId(s.id)
    setEditForm({ analysis_head_id: s.analysis_head_id, name: s.name, description: s.description ?? '' })
    setError('')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    setError('')
    setSaving(true)
    let res: Response
    let data: CallScenario | ApiError | null
    try {
      res = await fetch(`/api/admin/call-scenarios/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      data = await readJson<CallScenario | ApiError>(res)
    } catch {
      setSaving(false)
      setError('Failed to update call scenario')
      return
    }
    setSaving(false)
    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Failed to update call scenario' : 'Failed to update call scenario')
      return
    }
    if (!isCallScenario(data)) { setError('Failed to update call scenario'); return }
    setScenarios((prev) => prev.map((s) => (s.id === editId ? data : s)))
    setEditId(null)
  }

  const toggleStatus = async (s: CallScenario) => {
    const newStatus = s.status === 'active' ? 'inactive' : 'active'
    setScenarios((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: newStatus } : x)))
    const res = await fetch(`/api/admin/call-scenarios/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) setScenarios((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: s.status } : x)))
  }

  // For edit form: show all heads (not just active) — use scenarios list to gather unique heads
  const allHeads: AnalysisHead[] = Array.from(
    new Map([
      ...activeHeads.map((h) => [h.id, h] as [string, AnalysisHead]),
      ...scenarios.map((s) => [s.analysis_head_id, { id: s.analysis_head_id, name: s.analysis_head.name }] as [string, AnalysisHead]),
    ]).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Call Scenarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Specific call types under each analysis head (e.g. Post-Webinar Call).</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setError('') }}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add Scenario'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Call Scenario</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Analysis Head *</label>
              <select value={addForm.analysis_head_id} onChange={(e) => setAddForm((f) => ({ ...f, analysis_head_id: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— Select —</option>
                {activeHeads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scenario Name *</label>
              <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Post-Webinar Call" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? 'Saving...' : 'Add Scenario'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['Analysis Head', 'Scenario Name', 'Description', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scenarios.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No call scenarios yet.</td></tr>
              )}
              {scenarios.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  {editId === s.id ? (
                    <td colSpan={4} className="px-4 py-3">
                      <form onSubmit={handleEdit} className="flex items-end gap-3">
                        <div><label className="block text-xs text-gray-500 mb-1">Analysis Head</label>
                          <select value={editForm.analysis_head_id} onChange={(e) => setEditForm((f) => ({ ...f, analysis_head_id: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44">
                            {allHeads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                          </select>
                        </div>
                        <div><label className="block text-xs text-gray-500 mb-1">Name *</label><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Description</label><input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" /></div>
                        <div className="flex gap-2 pb-0.5">
                          <button type="submit" disabled={saving} className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? '...' : 'Save'}</button>
                          <button type="button" onClick={() => setEditId(null)} className="border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-gray-700">{s.analysis_head.name}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-3 text-gray-500">{s.description ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {s.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </>
                  )}
                  {editId !== s.id && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(s)} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        <button onClick={() => toggleStatus(s)} className={`text-xs font-medium ${s.status === 'active' ? 'text-gray-500 hover:text-red-500' : 'text-green-600 hover:text-green-700'}`}>
                          {s.status === 'active' ? 'Deactivate' : 'Activate'}
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
