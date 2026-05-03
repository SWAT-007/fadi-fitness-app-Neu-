'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { ExerciseLibraryItem } from '@/lib/types'

type LibForm = {
  name: string
  muscle_group: string
  equipment: string
}

const emptyForm = (): LibForm => ({ name: '', muscle_group: '', equipment: '' })

const MUSCLE_GROUPS = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Gesäß', 'Bauch', 'Waden', 'Unterarme', 'Ganzkörper', 'Cardio'] as const

const EQUIPMENT = ['Langhantel', 'Kurzhantel', 'Maschine', 'Kabelzug', 'Körpergewicht', 'Klimmzugstange', 'Kettlebell', 'Bank', 'Sonstiges'] as const

export default function ExerciseLibraryPage() {
  const [items, setItems] = useState<ExerciseLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<ExerciseLibraryItem | null>(null)
  const [form, setForm] = useState<LibForm>(emptyForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)
    const { data } = await supabase.from('exercise_library').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const muscleGroups = MUSCLE_GROUPS as readonly string[]

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase())
    const matchGroup = !filterGroup || i.muscle_group === filterGroup
    return matchSearch && matchGroup
  })

  const resetForm = () => {
    setForm(emptyForm())
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(false)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openAdd = () => {
    setEditItem(null)
    resetForm()
    setShowForm(true)
  }

  const openEdit = (item: ExerciseLibraryItem) => {
    setEditItem(item)
    setForm({
      name: item.name,
      muscle_group: item.muscle_group ?? '',
      equipment: item.equipment ?? '',
    })
    setImageFile(null)
    setImagePreview(item.image_url ?? null)
    setRemoveImage(false)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setShowForm(true)
  }

  const handlePickFile = (file: File | null) => {
    if (!file) {
      setImageFile(null)
      setImagePreview(editItem?.image_url ?? null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Bitte eine Bilddatei auswählen.')
      return
    }
    setImageFile(file)
    setRemoveImage(false)
    const reader = new FileReader()
    reader.onload = e => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!userId) return null
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('exercise-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) {
      setError(`Bild-Upload fehlgeschlagen: ${upErr.message}`)
      return null
    }
    const { data } = supabase.storage.from('exercise-images').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name ist erforderlich.'); return }
    setSaving(true)
    setError(null)

    let image_url: string | null | undefined = undefined
    if (imageFile) {
      const uploaded = await uploadImage(imageFile)
      if (!uploaded) { setSaving(false); return }
      image_url = uploaded
    } else if (removeImage) {
      image_url = null
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      muscle_group: form.muscle_group.trim() || null,
      equipment: form.equipment.trim() || null,
    }
    if (image_url !== undefined) payload.image_url = image_url

    if (editItem) {
      const { error: err } = await supabase.from('exercise_library').update(payload).eq('id', editItem.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('exercise_library').insert({ ...payload, created_by: userId })
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    setShowForm(false)
    await load()
  }

  const handleDelete = async (item: ExerciseLibraryItem) => {
    if (!confirm(`„${item.name}" wirklich löschen?`)) return
    const { error: err } = await supabase.from('exercise_library').delete().eq('id', item.id)
    if (err) { alert(err.message); return }
    await load()
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin/plans" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurück zu Trainingsplänen
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Übungs-Datenbank</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} Übungen · Name + Bild</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          + Übung hinzufügen
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            {editItem ? `„${editItem.name}" bearbeiten` : 'Neue Übung'}
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
                <input autoFocus value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Bankdrücken"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Muskelgruppe</label>
                <select value={form.muscle_group} onChange={e => setForm(p => ({ ...p, muscle_group: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white">
                  <option value="">— Auswählen —</option>
                  {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Equipment</label>
              <select value={form.equipment} onChange={e => setForm(p => ({ ...p, equipment: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white">
                <option value="">— Auswählen —</option>
                {EQUIPMENT.map(eq => <option key={eq} value={eq}>{eq}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Bild</label>
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-300 text-xs">Kein Bild</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handlePickFile(e.target.files?.[0] ?? null)}
                    className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {imagePreview && !imageFile && editItem?.image_url && (
                    <button type="button" onClick={() => { setImagePreview(null); setRemoveImage(true) }}
                      className="block text-xs text-red-500 hover:text-red-700">Bild entfernen</button>
                  )}
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">⚠️ {error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                Abbrechen
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
                {saving ? 'Speichern…' : editItem ? 'Aktualisieren' : 'Hinzufügen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
          <option value="">Alle Muskelgruppen</option>
          {muscleGroups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400 text-sm">
          {items.length === 0 ? 'Noch keine Übungen in der Datenbank.' : 'Keine Treffer.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="aspect-square bg-gray-100 overflow-hidden">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Kein Bild</div>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">{item.name}</div>
                <div className="text-xs text-gray-400 mb-3">
                  {[item.muscle_group, item.equipment].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="mt-auto flex gap-1 justify-end">
                  <button onClick={() => openEdit(item)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">Bearbeiten</button>
                  <button onClick={() => handleDelete(item)} className="px-2 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">Löschen</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
