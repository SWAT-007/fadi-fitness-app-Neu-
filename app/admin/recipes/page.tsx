'use client'

import { useEffect, useState, useCallback } from 'react'

interface RecipeRow {
  id: string
  name: string
  description: string | null
  instructions: string | null
  imageUrl: string | null
  ingredients: unknown | null
  servings: number | null
  totalCalories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  sourcePdf: string | null
  category: string | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  createdAt: string
  updatedAt: string
}

interface RecipeForm {
  name: string
  description: string
  instructions: string
  category: string
  servings: string
  totalCalories: string
  proteinG: string
  carbsG: string
  fatG: string
  prepTimeMinutes: string
  cookTimeMinutes: string
  sourcePdf: string
  imageUrl: string
  ingredientsText: string
}

const emptyForm: RecipeForm = {
  name: '',
  description: '',
  instructions: '',
  category: '',
  servings: '',
  totalCalories: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  prepTimeMinutes: '',
  cookTimeMinutes: '',
  sourcePdf: '',
  imageUrl: '',
  ingredientsText: '',
}

function parseIngredients(text: string): { name: string }[] | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.length > 0 ? lines.map((name) => ({ name })) : null
}

function ingredientsToText(ingredients: unknown): string {
  if (!Array.isArray(ingredients)) return ''
  return (ingredients as { name?: string }[])
    .map((i) => (typeof i === 'string' ? i : (i?.name ?? '')))
    .filter(Boolean)
    .join('\n')
}

function recipeToForm(r: RecipeRow): RecipeForm {
  return {
    name: r.name,
    description: r.description ?? '',
    instructions: r.instructions ?? '',
    category: r.category ?? '',
    servings: r.servings != null ? String(r.servings) : '',
    totalCalories: r.totalCalories != null ? String(r.totalCalories) : '',
    proteinG: r.proteinG != null ? String(r.proteinG) : '',
    carbsG: r.carbsG != null ? String(r.carbsG) : '',
    fatG: r.fatG != null ? String(r.fatG) : '',
    prepTimeMinutes: r.prepTimeMinutes != null ? String(r.prepTimeMinutes) : '',
    cookTimeMinutes: r.cookTimeMinutes != null ? String(r.cookTimeMinutes) : '',
    sourcePdf: r.sourcePdf ?? '',
    imageUrl: r.imageUrl ?? '',
    ingredientsText: ingredientsToText(r.ingredients),
  }
}

function parseOptionalFloat(s: string): number | null {
  if (!s.trim()) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function parseOptionalInt(s: string): number | null {
  if (!s.trim()) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1'

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RecipeForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/backend/nutrition/recipes')
    const data = res.ok ? await res.json().catch(() => null) : null
    setRecipes((data?.recipes ?? []) as RecipeRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (r: RecipeRow) => {
    setEditingId(r.id)
    setForm(recipeToForm(r))
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const setField =
    (field: keyof RecipeForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('Name ist erforderlich.')
      return
    }
    setSaving(true)
    setFormError(null)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      category: form.category.trim() || null,
      servings: parseOptionalInt(form.servings),
      totalCalories: parseOptionalFloat(form.totalCalories),
      proteinG: parseOptionalFloat(form.proteinG),
      carbsG: parseOptionalFloat(form.carbsG),
      fatG: parseOptionalFloat(form.fatG),
      prepTimeMinutes: parseOptionalInt(form.prepTimeMinutes),
      cookTimeMinutes: parseOptionalInt(form.cookTimeMinutes),
      sourcePdf: form.sourcePdf.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      ingredients: parseIngredients(form.ingredientsText),
    }

    const res = editingId
      ? await fetch(`/api/backend/nutrition/recipes/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/backend/nutrition/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

    if (res.ok) {
      closeModal()
      await load()
    } else {
      const data = await res.json().catch(() => null)
      setFormError((data as { message?: string } | null)?.message ?? 'Fehler beim Speichern.')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    const res = await fetch(`/api/backend/nutrition/recipes/${id}`, { method: 'DELETE' })
    if (res.ok) setRecipes((prev) => prev.filter((r) => r.id !== id))
    setDeleting(null)
  }

  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rezepte</h1>
          <p className="text-sm text-gray-500 mt-0.5">{recipes.length} Rezepte in der Datenbank</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
          >
            + Neues Rezept
          </button>
          <button
            disabled
            className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-semibold rounded-xl cursor-not-allowed"
            title="PDF-Import wird nach der Rezept-Schema-Migration wieder aktiviert."
          >
            PDF-Import vorübergehend deaktiviert
          </button>
        </div>
      </div>

      {/* PDF import banner */}
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
        PDF-Import wird nach der Rezept-Schema-Migration wieder aktiviert.
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rezepte suchen..."
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      />

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
          {recipes.length === 0 ? 'Noch keine Rezepte vorhanden.' : 'Keine Rezepte gefunden.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const hasMacros =
              r.totalCalories != null || r.proteinG != null || r.carbsG != null || r.fatG != null
            const timeInfo = [
              r.prepTimeMinutes != null && `Vorbereitung: ${r.prepTimeMinutes} Min`,
              r.cookTimeMinutes != null && `Kochen: ${r.cookTimeMinutes} Min`,
            ]
              .filter(Boolean)
              .join(' · ')

            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Card header */}
                <div
                  className="flex items-start justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{r.name}</p>
                      {r.category && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                          {r.category}
                        </span>
                      )}
                      {r.servings != null && (
                        <span className="text-xs text-gray-400">{r.servings} Port.</span>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[340px]">
                        {r.description}
                      </p>
                    )}
                    {hasMacros && (
                      <p className="text-xs text-gray-400 mt-1">
                        {[
                          r.totalCalories != null && `${r.totalCalories} kcal`,
                          r.proteinG != null && `P: ${r.proteinG}g`,
                          r.carbsG != null && `K: ${r.carbsG}g`,
                          r.fatG != null && `F: ${r.fatG}g`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {timeInfo && <p className="text-xs text-gray-400 mt-0.5">{timeInfo}</p>}
                    {r.sourcePdf && (
                      <p className="text-xs text-indigo-400 mt-0.5 truncate max-w-[340px]">
                        PDF: {r.sourcePdf}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    <span className="text-gray-400 text-lg">{expanded === r.id ? '▲' : '▼'}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(r)
                      }}
                      className="text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(r.id)
                      }}
                      disabled={deleting === r.id}
                      className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {deleting === r.id ? '...' : 'Löschen'}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded === r.id && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4 text-sm">
                    {r.instructions && (
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">Zubereitung</p>
                        <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                          {r.instructions}
                        </p>
                      </div>
                    )}
                    {Array.isArray(r.ingredients) &&
                      (r.ingredients as unknown[]).length > 0 && (
                        <div>
                          <p className="font-semibold text-gray-700 mb-1">Zutaten</p>
                          <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                            {(r.ingredients as { name?: string }[]).map((ing, i) => (
                              <li key={i}>
                                {typeof ing === 'string' ? ing : (ing?.name ?? '')}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {r.imageUrl && (
                      <p className="text-xs text-gray-400">Bild: {r.imageUrl}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Rezept bearbeiten' : 'Neues Rezept'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Form body */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className={labelCls}>Name *</label>
                <input
                  value={form.name}
                  onChange={setField('name')}
                  className={inputCls}
                  placeholder="Rezeptname"
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Beschreibung</label>
                <textarea
                  value={form.description}
                  onChange={setField('description')}
                  className={inputCls}
                  rows={2}
                  placeholder="Kurze Beschreibung..."
                />
              </div>

              {/* Category */}
              <div>
                <label className={labelCls}>Kategorie</label>
                <input
                  value={form.category}
                  onChange={setField('category')}
                  className={inputCls}
                  placeholder="z.B. Frühstück, Mittagessen..."
                />
              </div>

              {/* Macros */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Kalorien (kcal)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.totalCalories}
                    onChange={setField('totalCalories')}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Protein (g)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.proteinG}
                    onChange={setField('proteinG')}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Kohlenhydrate (g)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.carbsG}
                    onChange={setField('carbsG')}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Fett (g)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.fatG}
                    onChange={setField('fatG')}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Servings + times */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Portionen</label>
                  <input
                    type="number"
                    min="1"
                    value={form.servings}
                    onChange={setField('servings')}
                    className={inputCls}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className={labelCls}>Vorbereitung (Min)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.prepTimeMinutes}
                    onChange={setField('prepTimeMinutes')}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Kochzeit (Min)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.cookTimeMinutes}
                    onChange={setField('cookTimeMinutes')}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Ingredients */}
              <div>
                <label className={labelCls}>Zutaten (eine pro Zeile)</label>
                <textarea
                  value={form.ingredientsText}
                  onChange={setField('ingredientsText')}
                  className={inputCls}
                  rows={4}
                  placeholder={'200g Hähnchenbrust\n1 Avocado\n100g Tomaten'}
                />
              </div>

              {/* Instructions */}
              <div>
                <label className={labelCls}>Zubereitung</label>
                <textarea
                  value={form.instructions}
                  onChange={setField('instructions')}
                  className={inputCls}
                  rows={5}
                  placeholder="Schritt für Schritt..."
                />
              </div>

              {/* sourcePdf */}
              <div>
                <label className={labelCls}>Quelle / PDF</label>
                <input
                  value={form.sourcePdf}
                  onChange={setField('sourcePdf')}
                  className={inputCls}
                  placeholder="Dateiname oder Pfad..."
                />
              </div>

              {/* imageUrl */}
              <div>
                <label className={labelCls}>Bild-URL</label>
                <input
                  value={form.imageUrl}
                  onChange={setField('imageUrl')}
                  className={inputCls}
                  placeholder="https://..."
                />
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {saving ? 'Speichern...' : editingId ? 'Aktualisieren' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
