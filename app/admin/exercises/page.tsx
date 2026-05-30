'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ExerciseLibraryItem } from '@/lib/types'
import { resolveImageUrl } from '@/lib/exercises'

type LibForm = {
  name: string
  muscle_group: string
  equipment: string
  image_url: string
}

type BackendExerciseLibraryItem = {
  id: string
  name: string
  muscleGroup: string | null
  equipment: string | null
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}

const emptyForm = (): LibForm => ({ name: '', muscle_group: '', equipment: '', image_url: '' })

const MUSCLE_GROUPS = [
  'Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine',
  'Gesäß', 'Bauch', 'Waden', 'Unterarme', 'Ganzkörper', 'Cardio',
] as const

const EQUIPMENT = [
  'Langhantel', 'Kurzhantel', 'Maschine', 'Kabelzug', 'Körpergewicht',
  'Klimmzugstange', 'Kettlebell', 'Bank', 'Sonstiges',
] as const

const mapBackendItem = (row: BackendExerciseLibraryItem): ExerciseLibraryItem => ({
  id: row.id,
  name: row.name,
  muscle_group: row.muscleGroup,
  equipment: row.equipment,
  image_url: row.imageUrl,
  created_by: null,
  created_at: row.createdAt,
})

const inputCls =
  'w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:ring-2 focus:ring-[#A78BFA]/40 focus:border-[#A78BFA]/30 focus:outline-none transition'
const selectCls =
  'w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] rounded-xl text-sm text-[#EDECEA] focus:ring-2 focus:ring-[#A78BFA]/40 focus:border-[#A78BFA]/30 focus:outline-none transition'
const labelCls = 'block text-xs font-medium text-[#797D83] mb-1.5'

export default function ExerciseLibraryPage() {
  const [items, setItems] = useState<ExerciseLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<ExerciseLibraryItem | null>(null)
  const [form, setForm] = useState<LibForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [imageUploading, setImageUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/backend/exercises/library', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (payload && typeof payload.message === 'string' && payload.message) || 'Übungen konnten nicht geladen werden.',
        )
        setItems([])
        setLoading(false)
        return
      }
      const rows: BackendExerciseLibraryItem[] =
        payload && Array.isArray(payload.exercises) ? payload.exercises : []
      setItems(rows.map(mapBackendItem))
    } catch {
      setItems([])
      setError('Backend nicht erreichbar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase())
    const matchGroup = !filterGroup || i.muscle_group === filterGroup
    return matchSearch && matchGroup
  })

  const resetForm = () => { setForm(emptyForm()); setError(null) }
  const openAdd = () => { setEditItem(null); resetForm(); setShowForm(true) }
  const openEdit = (item: ExerciseLibraryItem) => {
    setEditItem(item)
    setForm({ name: item.name, muscle_group: item.muscle_group ?? '', equipment: item.equipment ?? '', image_url: item.image_url ?? '' })
    setError(null)
    setShowForm(true)
  }

  const handleImageUpload = async (id: string, file: File | null) => {
    if (!file) return
    setImageUploading(id)
    setError(null)
    const fd = new FormData()
    fd.append('image', file)
    try {
      const response = await fetch(`/api/backend/exercises/library/${id}/image`, { method: 'POST', body: fd })
      const payload = await response.json().catch(() => null) as {
        exercise?: BackendExerciseLibraryItem
        message?: string
        errorId?: string
      } | null
      if (!response.ok) {
        const msg = payload?.message ?? 'Bild-Upload fehlgeschlagen.'
        setError(payload?.errorId ? `${msg} [${payload.errorId}]` : msg)
        return
      }
      if (payload?.exercise) {
        const updated = mapBackendItem(payload.exercise)
        setItems(prev => prev.map(i => i.id === id ? updated : i))
        setEditItem(updated)
        setForm(prev => ({ ...prev, image_url: updated.image_url ?? '' }))
      }
    } catch {
      setError('Backend nicht erreichbar.')
    } finally {
      setImageUploading(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name ist erforderlich.'); return }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(
        editItem ? `/api/backend/exercises/library/${editItem.id}` : '/api/backend/exercises/library',
        {
          method: editItem ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            muscleGroup: form.muscle_group.trim() || null,
            equipment: form.equipment.trim() || null,
            imageUrl: form.image_url.trim() || null,
          }),
        },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (payload && typeof payload.message === 'string' && payload.message) || 'Speichern fehlgeschlagen.',
        )
        setSaving(false)
        return
      }
      setShowForm(false)
      await load()
    } catch {
      setError('Backend nicht erreichbar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: ExerciseLibraryItem) => {
    if (!confirm(`"${item.name}" wirklich löschen?`)) return
    const response = await fetch(`/api/backend/exercises/library/${item.id}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      alert((payload && typeof payload.message === 'string' && payload.message) || 'Löschen fehlgeschlagen.')
      return
    }
    await load()
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/admin/plans"
        className="flex items-center gap-1.5 text-sm text-[#797D83] hover:text-[#EDECEA] mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurück zu Trainingsplänen
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#EDECEA]">Übungs-Datenbank</h1>
          <p className="text-sm text-[#797D83] mt-0.5">{items.length} Übungen · Name + Bild</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Übung hinzufügen
        </button>
      </div>

      {showForm && (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-6 mb-5">
          <h2 className="font-semibold text-[#EDECEA] mb-4">
            {editItem ? `"${editItem.name}" bearbeiten` : 'Neue Übung'}
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Bankdrücken"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Muskelgruppe</label>
                <select
                  value={form.muscle_group}
                  onChange={(e) => setForm((p) => ({ ...p, muscle_group: e.target.value }))}
                  className={selectCls}
                >
                  <option value="">— Auswählen —</option>
                  {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Equipment</label>
              <select
                value={form.equipment}
                onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))}
                className={selectCls}
              >
                <option value="">— Auswählen —</option>
                {EQUIPMENT.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
              </select>
            </div>

            {editItem && (
              <div>
                <label className={labelCls}>Bild hochladen</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {resolveImageUrl(editItem.image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveImageUrl(editItem.image_url)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[#797D83] text-xs">—</span>
                    )}
                  </div>
                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors select-none ${
                      imageUploading === editItem.id
                        ? 'bg-white/[0.03] border-white/[0.06] text-[#797D83] cursor-wait'
                        : 'bg-white/[0.06] border-white/[0.08] text-[#EDECEA] hover:bg-white/[0.10] cursor-pointer'
                    }`}>
                      {imageUploading === editItem.id ? (
                        <>
                          <span className="w-3 h-3 border-2 border-[#797D83] border-t-[#A78BFA] rounded-full animate-spin" />
                          Wird hochgeladen…
                        </>
                      ) : (
                        'Bild hochladen / ändern'
                      )}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      className="sr-only"
                      disabled={imageUploading === editItem.id}
                      onChange={(e) => { void handleImageUpload(editItem.id, e.target.files?.[0] ?? null) }}
                    />
                    <span className="text-xs text-[#797D83]">Max. 10 MB · JPG, PNG, WebP, HEIC</span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Bild-URL</label>
              <input
                value={form.image_url}
                onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
                placeholder="https://... oder /uploads/exercises/..."
                className={inputCls}
              />
              <p className="text-xs text-[#797D83] mt-1">Oder URL manuell eingeben / korrigieren.</p>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">⚠ {error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-white/[0.08] text-[#797D83] text-sm rounded-xl hover:bg-white/[0.04] transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
              >
                {saving ? 'Speichern…' : editItem ? 'Aktualisieren' : 'Hinzufügen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && !showForm && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl mb-4">⚠ {error}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="flex-1 px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:ring-2 focus:ring-[#A78BFA]/40 focus:border-[#A78BFA]/30 focus:outline-none transition"
        />
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] rounded-xl text-sm text-[#EDECEA] focus:ring-2 focus:ring-[#A78BFA]/40 focus:border-[#A78BFA]/30 focus:outline-none transition"
        >
          <option value="">Alle Muskelgruppen</option>
          {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-16 text-center text-[#797D83] text-sm">
          {items.length === 0 ? 'Noch keine Übungen in der Datenbank.' : 'Keine Treffer.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((item) => (
            <div key={item.id} className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col">
              <div className="aspect-square bg-white/[0.04] overflow-hidden">
                {resolveImageUrl(item.image_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveImageUrl(item.image_url)!} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#797D83] text-xs">Kein Bild</div>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="font-semibold text-[#EDECEA] text-sm leading-tight mb-1 line-clamp-2">{item.name}</div>
                <div className="text-xs text-[#797D83] mb-3">
                  {[item.muscle_group, item.equipment].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="mt-auto flex gap-1 justify-end">
                  <button
                    onClick={() => openEdit(item)}
                    className="px-2 py-1 text-xs text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.06] rounded-lg transition-colors"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="px-2 py-1 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
