'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ExercisePicker from '@/components/ExercisePicker'
import { supabase } from '@/lib/supabase'
import type { WorkoutPlan, WorkoutDay, Exercise } from '@/lib/types'
import type { LibraryExercise } from '@/lib/exercises'
import { Collapsible, StaggerItem, useToast } from '@/components/Motion'

type ExerciseForm = {
  name: string; description: string; sets: number; reps: string
  target_weight: string; rest_seconds: string; note: string
}

const emptyExForm: ExerciseForm = { name: '', description: '', sets: 3, reps: '10', target_weight: '', rest_seconds: '90', note: '' }

export default function PlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { showToast } = useToast()

  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [days, setDays] = useState<WorkoutDay[]>([])
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({})
  const [loading, setLoading] = useState(true)

  // Plan editing
  const [editingPlan, setEditingPlan] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planDesc, setPlanDesc] = useState('')

  // Day modal
  const [dayModal, setDayModal] = useState<{ open: boolean; editing: WorkoutDay | null }>({ open: false, editing: null })
  const [dayName, setDayName] = useState('')
  const [dayDesc, setDayDesc] = useState('')

  // Exercise modal
  const [exModal, setExModal] = useState<{ open: boolean; dayId: string; editing: Exercise | null }>({ open: false, dayId: '', editing: null })
  const [exForm, setExForm] = useState<ExerciseForm>(emptyExForm)
  const [pickerDayId, setPickerDayId] = useState<string | null>(null)

  // Expanded day (single open accordion behavior)
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [planRes, daysRes] = await Promise.all([
      supabase.from('workout_plans').select('*').eq('id', id).single(),
      supabase.from('workout_days').select('*').eq('plan_id', id).order('sort_order'),
    ])
    if (!planRes.data) { router.push('/admin/plans'); return }
    setPlan(planRes.data)
    setPlanName(planRes.data.name)
    setPlanDesc(planRes.data.description ?? '')

    const dayList = daysRes.data ?? []
    setDays(dayList)

    if (dayList.length > 0) {
      const exRes = await supabase
        .from('exercises')
        .select('*')
        .in('day_id', dayList.map(d => d.id))
        .order('sort_order')
      const exByDay: Record<string, Exercise[]> = {}
      dayList.forEach(d => { exByDay[d.id] = [] })
      ;(exRes.data ?? []).forEach(ex => {
        if (exByDay[ex.day_id]) exByDay[ex.day_id].push(ex)
      })
      setExercises(exByDay)
      setExpandedDayId(prev => (prev && dayList.some(d => d.id === prev) ? prev : null))
    } else {
      setExercises({})
      setExpandedDayId(null)
    }
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  const savePlan = async () => {
    await supabase.from('workout_plans').update({ name: planName, description: planDesc || null }).eq('id', id)
    setPlan(p => p ? { ...p, name: planName, description: planDesc } : p)
    setEditingPlan(false)
    showToast('Plan gespeichert ✓', 'success')
  }

  const openAddDay = () => { setDayModal({ open: true, editing: null }); setDayName(''); setDayDesc('') }
  const openEditDay = (day: WorkoutDay) => { setDayModal({ open: true, editing: day }); setDayName(day.name); setDayDesc(day.description ?? '') }

  const saveDay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (dayModal.editing) {
      await supabase.from('workout_days').update({ name: dayName, description: dayDesc || null }).eq('id', dayModal.editing.id)
    } else {
      const { error } = await supabase.from('workout_days').insert({ plan_id: id, name: dayName, description: dayDesc || null, sort_order: days.length })
      if (!error) {
        const { data: assignedRows } = await supabase
          .from('assigned_plans')
          .select('client:clients(user_id)')
          .eq('plan_id', id)
          .eq('is_active', true)

        const notificationRows = ((assignedRows ?? []) as unknown as Array<{ client: { user_id: string | null } | { user_id: string | null }[] | null }>)
          .map(row => Array.isArray(row.client) ? row.client[0]?.user_id : row.client?.user_id)
          .filter((userId): userId is string => Boolean(userId))
          .map(userId => ({
            client_id: userId,
            type: 'workout',
            title: 'Neues Workout hinzugefügt',
            body: `${plan?.name ?? 'Trainingsplan'}: ${dayName}`,
          }))

        if (notificationRows.length > 0) {
          await supabase.from('notifications').insert(notificationRows)
        }
      }
    }
    setDayModal({ open: false, editing: null })
    showToast(dayModal.editing ? 'Trainingstag gespeichert ✓' : 'Trainingstag erstellt ✓', 'success')
    await load()
  }

  const deleteDay = async (dayId: string) => {
    if (!confirm('Trainingstag und alle Übungen löschen?')) return
    await supabase.from('workout_days').delete().eq('id', dayId)
    showToast('Trainingstag geloescht', 'danger')
    await load()
  }

  const openAddEx = (dayId: string) => {
    setExpandedDayId(dayId)
    setPickerDayId(dayId)
  }
  const openEditEx = (ex: Exercise) => {
    setExpandedDayId(ex.day_id)
    setExModal({ open: true, dayId: ex.day_id, editing: ex })
    setExForm({
      name: ex.name, description: ex.description ?? '', sets: ex.sets, reps: ex.reps,
      target_weight: ex.target_weight?.toString() ?? '', rest_seconds: ex.rest_seconds?.toString() ?? '90', note: ex.note ?? '',
    })
  }

  const addPickedExercise = async (exercise: LibraryExercise) => {
    if (!pickerDayId) return

    await supabase.from('exercises').insert({
      day_id: pickerDayId,
      name: exercise.name,
      sets: 3,
      reps: '10',
      rest_seconds: 60,
      sort_order: exercises[pickerDayId]?.length ?? 0,
      library_id: exercise.id,
      image_url: exercise.image_url ?? null,
    })
    setPickerDayId(null)
    showToast('Uebung hinzugefuegt ✓', 'success')
    await load()
  }

  const saveEx = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      day_id: exModal.dayId,
      name: exForm.name,
      description: exForm.description || null,
      sets: exForm.sets,
      reps: exForm.reps,
      target_weight: exForm.target_weight ? parseFloat(exForm.target_weight) : null,
      rest_seconds: exForm.rest_seconds ? parseInt(exForm.rest_seconds) : 90,
      note: exForm.note || null,
      sort_order: exModal.editing ? exModal.editing.sort_order : (exercises[exModal.dayId]?.length ?? 0),
    }
    if (exModal.editing) {
      await supabase.from('exercises').update(payload).eq('id', exModal.editing.id)
    } else {
      await supabase.from('exercises').insert(payload)
    }
    setExModal({ open: false, dayId: '', editing: null })
    showToast(exModal.editing ? 'Uebung gespeichert ✓' : 'Uebung erstellt ✓', 'success')
    await load()
  }

  const deleteEx = async (exId: string) => {
    if (!confirm('Übung löschen?')) return
    await supabase.from('exercises').delete().eq('id', exId)
    showToast('Uebung geloescht', 'danger')
    await load()
  }

  const toggleDay = (dayId: string) => {
    setExpandedDayId(prev => (prev === dayId ? null : dayId))
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <Link href="/admin/plans" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Zurück zu Pläne
      </Link>

      {/* Plan Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        {editingPlan ? (
          <div className="space-y-3">
            <input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              className="w-full text-xl font-bold border-b border-gray-200 pb-1 focus:outline-none focus:border-indigo-500"
            />
            <textarea
              value={planDesc}
              onChange={e => setPlanDesc(e.target.value)}
              placeholder="Beschreibung…"
              rows={2}
              className="w-full text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-2">
              <button onClick={savePlan} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">Speichern</button>
              <button onClick={() => setEditingPlan(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{plan?.name}</h1>
              {plan?.description && <p className="text-sm text-gray-500 mt-1">{plan.description}</p>}
              <p className="text-xs text-gray-400 mt-2">{days.length} Trainingstag{days.length !== 1 ? 'e' : ''}</p>
            </div>
            <button onClick={() => setEditingPlan(true)} className="text-sm text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 flex-shrink-0">Bearbeiten</button>
          </div>
        )}
      </div>

      {/* Days */}
      <div className="space-y-3 mb-4">
        {days.map((day, di) => (
          <div key={day.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Day header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleDay(day.id)}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {di + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{day.name}</div>
                {day.description && <div className="text-xs text-gray-500 truncate">{day.description}</div>}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span>{exercises[day.id]?.length ?? 0} Übungen</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={e => { e.stopPropagation(); openEditDay(day) }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">✏️</button>
                <button onClick={e => { e.stopPropagation(); deleteDay(day.id) }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">🗑️</button>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedDayId === day.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Exercises */}
            <Collapsible open={expandedDayId === day.id}>
              <div className="border-t border-gray-100">
                {(exercises[day.id] ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 px-5 py-4">Noch keine Übungen.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {(exercises[day.id] ?? []).map((ex, ei) => (
                      <li key={ex.id}>
                        <StaggerItem index={ei} className="px-5 py-3 flex items-start gap-3">
                        <div className="w-6 h-6 rounded-md bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          {ei + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900">{ex.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                            <span>{ex.sets} Sätze × {ex.reps} Wdh.</span>
                            {ex.target_weight && <span>Zielgewicht: {ex.target_weight} kg</span>}
                            {ex.rest_seconds && <span>Pause: {ex.rest_seconds}s</span>}
                          </div>
                          {ex.note && <div className="text-xs text-indigo-600 mt-0.5">{ex.note}</div>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => openEditEx(ex)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-xs">✏️</button>
                          <button onClick={() => deleteEx(ex.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs">🗑️</button>
                        </div>
                        </StaggerItem>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-5 py-3 border-t border-gray-100">
                  <button
                    onClick={() => openAddEx(day.id)}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <span>+</span> Übung hinzufügen
                  </button>
                </div>
              </div>
            </Collapsible>
          </div>
        ))}
      </div>

      <button
        onClick={openAddDay}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
      >
        + Trainingstag hinzufügen
      </button>

      {/* Day Modal */}
      {dayModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{dayModal.editing ? 'Tag bearbeiten' : 'Neuer Trainingstag'}</h2>
            </div>
            <form onSubmit={saveDay} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
                <input required autoFocus value={dayName} onChange={e => setDayName(e.target.value)} placeholder="z.B. Push, Pull, Legs" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Beschreibung</label>
                <input value={dayDesc} onChange={e => setDayDesc(e.target.value)} placeholder="Optional" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setDayModal({ open: false, editing: null })} className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">Abbrechen</button>
                <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exercise Modal */}
      {exModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-4">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{exModal.editing ? 'Übung bearbeiten' : 'Neue Übung'}</h2>
            </div>
            <form onSubmit={saveEx} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
                <input required autoFocus value={exForm.name} onChange={e => setExForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Bankdrücken" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Beschreibung</label>
                <textarea value={exForm.description} onChange={e => setExForm(f => ({ ...f, description: e.target.value }))} placeholder="Ausführung, Hinweise…" rows={2} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Sätze</label>
                  <input type="number" min={1} max={20} value={exForm.sets} onChange={e => setExForm(f => ({ ...f, sets: parseInt(e.target.value) || 1 }))} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Wiederholungen</label>
                  <input value={exForm.reps} onChange={e => setExForm(f => ({ ...f, reps: e.target.value }))} placeholder="10 oder 8-12" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Zielgewicht (kg)</label>
                  <input type="number" step="0.5" value={exForm.target_weight} onChange={e => setExForm(f => ({ ...f, target_weight: e.target.value }))} placeholder="0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Pause (Sekunden)</label>
                  <input type="number" value={exForm.rest_seconds} onChange={e => setExForm(f => ({ ...f, rest_seconds: e.target.value }))} placeholder="90" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notiz für Kunden</label>
                <input value={exForm.note} onChange={e => setExForm(f => ({ ...f, note: e.target.value }))} placeholder="Hinweis, Technik-Tipp…" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setExModal({ open: false, dayId: '', editing: null })} className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">Abbrechen</button>
                <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ExercisePicker
        open={pickerDayId !== null}
        onClose={() => setPickerDayId(null)}
        onSelect={addPickedExercise}
      />
    </div>
  )
}
