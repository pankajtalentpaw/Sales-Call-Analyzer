'use client'

import { useState, useEffect } from 'react'

type Employee = {
  id: string
  name: string
  display_name: string
  employee_code: string | null
  email: string | null
  default_language: string
  status: string
}

const LANGS = ['Hindi', 'Gujarati', 'English', 'Mixed']

const emptyForm = { name: '', display_name: '', employee_code: '', email: '', password: '', default_language: 'Mixed' }

type ApiError = { error?: string }

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

function isApiError(data: unknown): data is ApiError {
  return typeof data === 'object' && data !== null && 'error' in data
}

function isEmployee(data: unknown): data is Employee {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'name' in data &&
    'display_name' in data &&
    'status' in data
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadEmployees() {
      try {
        const res = await fetch('/api/admin/employees')
        const data = await readJson<Employee[] | ApiError>(res)
        if (ignore) return

        if (!res.ok || !Array.isArray(data)) {
          setError(isApiError(data) ? data.error ?? 'Failed to load employees' : 'Failed to load employees')
          return
        }

        setEmployees(data)
      } catch {
        if (!ignore) setError('Failed to load employees')
      }
    }

    loadEmployees()

    return () => {
      ignore = true
    }
  }, [])

  const refresh = async () => {
    try {
      const res = await fetch('/api/admin/employees')
      const data = await readJson<Employee[] | ApiError>(res)
      if (!res.ok || !Array.isArray(data)) {
        setError(isApiError(data) ? data.error ?? 'Failed to refresh employees' : 'Failed to refresh employees')
        return
      }
      setEmployees(data)
    } catch {
      setError('Failed to refresh employees')
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    let res: Response
    let data: Employee | ApiError | null
    try {
      res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      data = await readJson<Employee | ApiError>(res)
    } catch {
      setSaving(false)
      setError('Failed to add employee')
      return
    }
    setSaving(false)
    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Failed to add employee' : 'Failed to add employee')
      return
    }
    if (!isEmployee(data)) { setError('Failed to add employee'); return }
    setEmployees((prev) => [...prev, data].sort((a, b) => a.display_name.localeCompare(b.display_name)))
    setAddForm(emptyForm)
    setShowAdd(false)
  }

  const startEdit = (emp: Employee) => {
    setEditId(emp.id)
    setEditForm({ name: emp.name, display_name: emp.display_name, employee_code: emp.employee_code ?? '', email: emp.email ?? '', password: '', default_language: emp.default_language })
    setError('')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    setError('')
    setSaving(true)
    let res: Response
    let data: Employee | ApiError | null
    try {
      res = await fetch(`/api/admin/employees/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      data = await readJson<Employee | ApiError>(res)
    } catch {
      setSaving(false)
      setError('Failed to update employee')
      return
    }
    setSaving(false)
    if (!res.ok) {
      setError(isApiError(data) ? data.error ?? 'Failed to update employee' : 'Failed to update employee')
      return
    }
    if (!isEmployee(data)) { setError('Failed to update employee'); return }
    setEmployees((prev) => prev.map((e) => (e.id === editId ? data : e)))
    setEditId(null)
  }

  const toggleStatus = async (emp: Employee) => {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active'
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, status: newStatus } : e)))
    const res = await fetch(`/api/admin/employees/${emp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, status: emp.status } : e)))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage sales team members available for call uploads.</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setError('') }}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add Employee'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Employee</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display Name *</label>
              <input value={addForm.display_name} onChange={(e) => setAddForm((f) => ({ ...f, display_name: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employee Code</label>
              <input value={addForm.employee_code} onChange={(e) => setAddForm((f) => ({ ...f, employee_code: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
              <input type="password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Default Language</label>
              <select value={addForm.default_language} onChange={(e) => setAddForm((f) => ({ ...f, default_language: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? 'Saving...' : 'Add Employee'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['Display Name', 'Email', 'Name', 'Employee Code', 'Language', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No employees yet.</td></tr>
              )}
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  {editId === emp.id ? (
                    <td colSpan={6} className="px-4 py-3">
                      <form onSubmit={handleEdit} className="flex flex-wrap items-end gap-3">
                        <div><label className="block text-xs text-gray-500 mb-1">Display Name *</label><input value={editForm.display_name} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Set New Password</label><input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="..." className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Name *</label><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Code</label><input value={editForm.employee_code} onChange={(e) => setEditForm((f) => ({ ...f, employee_code: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Language</label><select value={editForm.default_language} onChange={(e) => setEditForm((f) => ({ ...f, default_language: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-24">{LANGS.map((l) => <option key={l}>{l}</option>)}</select></div>
                        <div className="flex gap-2 pb-0.5">
                          <button type="submit" disabled={saving} className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60">{saving ? '...' : 'Save'}</button>
                          <button type="button" onClick={() => setEditId(null)} className="border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.display_name}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.name}</td>
                      <td className="px-4 py-3 text-gray-500">{emp.employee_code ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.default_language}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {emp.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </>
                  )}
                  {editId !== emp.id && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(emp)} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        <button onClick={() => toggleStatus(emp)} className={`text-xs font-medium ${emp.status === 'active' ? 'text-gray-500 hover:text-red-500' : 'text-green-600 hover:text-green-700'}`}>
                          {emp.status === 'active' ? 'Deactivate' : 'Activate'}
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
