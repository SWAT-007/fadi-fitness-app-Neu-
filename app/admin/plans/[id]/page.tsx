'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ExercisePicker from '@/components/ExercisePicker'
import type { WorkoutPlan, WorkoutDay, Exercise } from '@/lib/types'
import type { LibraryExercise } from '@/lib/exercises'
import { Collapsible, StaggerItem, useToast } from '@/components/Motion'

type ExerciseForm = {
  name: string; description: string; sets: number; reps: string
  target_weight: string; rest_seconds: string; note: string
}

const emptyExForm: ExerciseForm = { name: '', description: '', sets: 3, reps: '10', target_weight: '', rest_seconds: '90', note: '' }

type BackendPlanDetailResponse = {
  plan: {
    id: string
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
  }
  days: Array<{
    id: string
    planId: string
    name: string
    description: string | null
    sortOrder: number
    exercises: Array<{
      id: string
      dayId: string
      name: string
      description: string | null
      sets: number
      reps: string
      targetWeightKg: number | null
      restSeconds: number | null
      note: string | null
      sortOrder: number
      imageUrl: string | null
      libraryId: string | null
    }>
  }>
}

export default function PlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  const deepLinkPlanId = useMemo(() => {
    const value = searchParams.get('planId')
    return value && value.trim() ? value.trim() : null
  }, [searchParams])
  const deepLinkDayId = useMemo(() => {
    const value = searchParams.get('dayId')
    return value && value.trim() ? value.trim() : null
  }, [searchParams])
  const deepLinkExerciseId = useMemo(() => {
    const value = searchParams.get('exerciseId')
    return value && value.trim() ? value.trim() : null
  }, [searchParams])
  const deepLinkRequestId = useMemo(() => {
    const value = searchParams.get('requestId')
    return value && value.trim() ? value.trim() : null
  }, [searchParams])

  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [days, setDays] = useState<WorkoutDay[]>([])
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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
  const [highlightExerciseId, setHighlightExerciseId] = useState<string | null>(null)
  const [linkedRequestResolved, setLinkedRequestResolved] = useState(false)
  const deepLinkNoticeShownRef = useRef(false)
  const deepLinkExerciseKeyRef = useRef<string | null>(null)
  const deepLinkMissingTargetKeyRef = useRef<string | null>(null)
  const exerciseRefs = useRef<Record<string, HTMLLIElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`/api/backend/plans/${id}`, { cache: 'no-store' })
      const payload = (await response.json().catch(() => null)) as BackendPlanDetailResponse | { message?: string; ok?: boolean } | null

      if (!response.ok) {
        if (response.status === 401) {
          setLoadError('Backend-Login erforderlich.')
        } else if (response.status === 404) {
          setLoadError('Plan nicht gefunden.')
        } else {
          setLoadError((payload && 'message' in payload && typeof payload.message === 'string' && payload.message) || 'Plan konnte nicht geladen werden.')
        }
        setPlan(null)
        setDays([])
        setExercises({})
        setExpandedDayId(null)
        return
      }

      if (!payload || !('plan' in payload) || !payload.plan || !Array.isArray(payload.days)) {
        setLoadError('Plan konnte nicht geladen werden.')
        setPlan(null)
        setDays([])
        setExercises({})
        setExpandedDayId(null)
        return
      }

      const mappedPlan = {
        id: payload.plan.id,
        trainer_id: '',
        name: payload.plan.name,
        description: payload.plan.description,
        created_at: payload.plan.createdAt,
        updated_at: payload.plan.updatedAt,
      } as WorkoutPlan

      const mappedDays = payload.days.map((day) => ({
        id: day.id,
        plan_id: day.planId,
        name: day.name,
        description: day.description,
        sort_order: day.sortOrder,
        created_at: payload.plan.createdAt,
      })) as WorkoutDay[]

      const mappedExercises: Record<string, Exercise[]> = {}
      for (const day of payload.days) {
        mappedExercises[day.id] = day.exercises.map((exercise) => ({
          id: exercise.id,
          day_id: exercise.dayId,
          name: exercise.name,
          description: exercise.description,
          sets: exercise.sets,
          reps: exercise.reps,
          target_weight: exercise.targetWeightKg,
          rest_seconds: exercise.restSeconds,
          note: exercise.note,
          sort_order: exercise.sortOrder,
          image_url: exercise.imageUrl,
          library_id: exercise.libraryId,
          created_at: payload.plan.createdAt,
        })) as Exercise[]
      }

      setPlan(mappedPlan)
      setPlanName(mappedPlan.name)
      setPlanDesc(mappedPlan.description ?? '')
      setDays(mappedDays)
      setExercises(mappedExercises)
      setExpandedDayId(prev => {
        if (deepLinkDayId && mappedDays.some(d => d.id === deepLinkDayId)) {
          return deepLinkDayId
        }
        return prev && mappedDays.some(d => d.id === prev) ? prev : null
      })
    } catch {
      setLoadError('Plan konnte nicht geladen werden.')
      setPlan(null)
      setDays([])
      setExercises({})
      setExpandedDayId(null)
    } finally {
      setLoading(false)
    }
  }, [deepLinkDayId, id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setLinkedRequestResolved(false)
  }, [deepLinkRequestId])

  useEffect(() => {
    deepLinkExerciseKeyRef.current = null
    deepLinkMissingTargetKeyRef.current = null
  }, [deepLinkDayId, deepLinkExerciseId, deepLinkRequestId, id])

  useEffect(() => {
    if (!deepLinkPlanId || deepLinkPlanId === id || deepLinkNoticeShownRef.current) return
    deepLinkNoticeShownRef.current = true
    showToast('Hinweis: Plan-ID aus Link passt nicht zur geöffneten Seite.', 'info')
  }, [deepLinkPlanId, id, showToast])

  useEffect(() => {
    if (!deepLinkDayId || !deepLinkExerciseId || loading) return

    const dayExists = days.some(day => day.id === deepLinkDayId)
    if (!dayExists) {
      const missingDayKey = `day:${id}:${deepLinkDayId}:${deepLinkExerciseId}:${deepLinkRequestId ?? ''}`
      if (deepLinkMissingTargetKeyRef.current !== missingDayKey) {
        deepLinkMissingTargetKeyRef.current = missingDayKey
        console.warn('[admin/plans] deep link day not found', {
          planId: id,
          dayId: deepLinkDayId,
          exerciseId: deepLinkExerciseId,
          requestId: deepLinkRequestId,
          availableDayIds: days.map(day => day.id),
        })
      }
      return
    }

    if (expandedDayId !== deepLinkDayId) {
      setExpandedDayId(deepLinkDayId)
      return
    }

    const dayExercises = exercises[deepLinkDayId] ?? []
    const targetExercise = dayExercises.find(exercise => exercise.id === deepLinkExerciseId) ?? null
    if (!targetExercise) {
      const missingExerciseKey = `exercise:${id}:${deepLinkDayId}:${deepLinkExerciseId}:${deepLinkRequestId ?? ''}`
      if (deepLinkMissingTargetKeyRef.current !== missingExerciseKey) {
        deepLinkMissingTargetKeyRef.current = missingExerciseKey
        console.warn('[admin/plans] deep link exercise not found', {
          planId: id,
          dayId: deepLinkDayId,
          exerciseId: deepLinkExerciseId,
          requestId: deepLinkRequestId,
          availableExercises: dayExercises.map(exercise => ({ id: exercise.id, name: exercise.name })),
        })
      }
      return
    }

    setHighlightExerciseId(deepLinkExerciseId)
    const deepLinkKey = `${id}:${deepLinkDayId}:${deepLinkExerciseId}:${deepLinkRequestId ?? ''}`
    const scrollTimer = window.setTimeout(() => {
      const node = exerciseRefs.current[deepLinkExerciseId]
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)

    let openModalTimer: number | undefined
    if (
      deepLinkExerciseKeyRef.current !== deepLinkKey &&
      (!exModal.open || exModal.editing?.id !== targetExercise.id)
    ) {
      deepLinkExerciseKeyRef.current = deepLinkKey
      openModalTimer = window.setTimeout(() => {
        openEditEx(targetExercise)
      }, 180)
    }

    return () => {
      window.clearTimeout(scrollTimer)
      if (openModalTimer) window.clearTimeout(openModalTimer)
    }
  }, [days, deepLinkDayId, deepLinkExerciseId, deepLinkRequestId, exercises, exModal.editing?.id, exModal.open, expandedDayId, id, loading])

  useEffect(() => {
    if (!highlightExerciseId) return
    const timer = window.setTimeout(() => setHighlightExerciseId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlightExerciseId])

  const markLinkedRequestResolved = useCallback(async () => {
    if (!deepLinkRequestId || linkedRequestResolved) return true

    try {
      const response = await fetch(`/api/backend/clients/exercise-change-requests/${deepLinkRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        const msg =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : payload?.message ?? 'Anfrage konnte nicht als erledigt markiert werden.'
        showToast(msg, 'danger')
        return false
      }

      setLinkedRequestResolved(true)
      return true
    } catch {
      showToast('Anfrage konnte nicht als erledigt markiert werden.', 'danger')
      return false
    }
  }, [deepLinkRequestId, linkedRequestResolved, showToast])

  const savePlan = async () => {
    const response = await fetch(`/api/backend/plans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: planName,
        description: planDesc || null,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.plan) {
      const msg =
        response.status === 401
          ? 'Backend-Login erforderlich.'
          : (payload && typeof payload.message === 'string' && payload.message) || 'Plan konnte nicht gespeichert werden.'
      showToast(msg, 'danger')
      return
    }
    setPlan(p => p ? { ...p, name: payload.plan.name, description: payload.plan.description } : p)
    setPlanName(payload.plan.name)
    setPlanDesc(payload.plan.description ?? '')
    setEditingPlan(false)
    await load()
    showToast('Plan gespeichert ✓', 'success')
  }

  const openAddDay = () => { setDayModal({ open: true, editing: null }); setDayName(''); setDayDesc('') }
  const openEditDay = (day: WorkoutDay) => { setDayModal({ open: true, editing: day }); setDayName(day.name); setDayDesc(day.description ?? '') }

  const saveDay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (dayModal.editing) {
      const response = await fetch(`/api/backend/workout-days/${dayModal.editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dayName,
          description: dayDesc || null,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const msg =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (payload && typeof payload.message === 'string' && payload.message) || 'Trainingstag konnte nicht gespeichert werden.'
        showToast(msg, 'danger')
        return
      }
    } else {
      const response = await fetch(`/api/backend/plans/${id}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dayName,
          description: dayDesc || null,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const msg =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (payload && typeof payload.message === 'string' && payload.message) || 'Trainingstag konnte nicht erstellt werden.'
        showToast(msg, 'danger')
        return
      }
    }
    setDayModal({ open: false, editing: null })
    showToast(dayModal.editing ? 'Trainingstag gespeichert ✓' : 'Trainingstag erstellt ✓', 'success')
    await load()
  }

  const deleteDay = async (dayId: string) => {
    if (!confirm('Trainingstag und alle Übungen löschen?')) return
    const response = await fetch(`/api/backend/workout-days/${dayId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const msg =
        response.status === 401
          ? 'Backend-Login erforderlich.'
          : (payload && typeof payload.message === 'string' && payload.message) || 'Trainingstag konnte nicht gelöscht werden.'
      showToast(msg, 'danger')
      return
    }
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

    const response = await fetch(`/api/backend/workout-days/${pickerDayId}/exercises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: exercise.name,
        description: null,
        sets: 3,
        reps: '10',
        restSeconds: 60,
        targetWeightKg: null,
        note: null,
        libraryItemId: exercise.id,
        imageUrl: exercise.image_url ?? null,
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      const msg =
        response.status === 401
          ? 'Backend-Login erforderlich.'
          : (data && typeof data.message === 'string' && data.message) || 'Übung konnte nicht hinzugefügt werden.'
      showToast(msg, 'danger')
      return
    }
    setPickerDayId(null)
    showToast('Übung hinzugefügt ✓', 'success')
    await load()
    if (deepLinkRequestId) {
      const requestResolved = await markLinkedRequestResolved()
      if (requestResolved) {
        showToast('Anfrage automatisch als erledigt markiert.', 'success')
      } else {
        showToast('Änderung gespeichert, Anfrage bitte manuell prüfen.', 'info')
      }
    }
  }

  const saveEx = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name: exForm.name,
      description: exForm.description || null,
      sets: exForm.sets,
      reps: exForm.reps,
      targetWeightKg: exForm.target_weight ? parseFloat(exForm.target_weight) : null,
      restSeconds: exForm.rest_seconds ? parseInt(exForm.rest_seconds) : 90,
      note: exForm.note || null,
      imageUrl: exModal.editing?.image_url ?? null,
    }
    if (exModal.editing) {
      const response = await fetch(`/api/backend/exercises/${exModal.editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const msg =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (data && typeof data.message === 'string' && data.message) || 'Übung konnte nicht gespeichert werden.'
        showToast(msg, 'danger')
        return
      }
    } else {
      const response = await fetch(`/api/backend/workout-days/${exModal.dayId}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const msg =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (data && typeof data.message === 'string' && data.message) || 'Übung konnte nicht erstellt werden.'
        showToast(msg, 'danger')
        return
      }
    }
    setExModal({ open: false, dayId: '', editing: null })
    showToast(exModal.editing ? 'Uebung gespeichert ✓' : 'Uebung erstellt ✓', 'success')
    await load()
    if (deepLinkRequestId) {
      const requestResolved = await markLinkedRequestResolved()
      if (requestResolved) {
        showToast('Anfrage automatisch als erledigt markiert.', 'success')
      } else {
        showToast('Änderung gespeichert, Anfrage bitte manuell prüfen.', 'info')
      }
    }
  }

  const deleteEx = async (exId: string) => {
    if (!confirm('Übung löschen?')) return
    const response = await fetch(`/api/backend/exercises/${exId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      const msg =
        response.status === 401
          ? 'Backend-Login erforderlich.'
          : (data && typeof data.message === 'string' && data.message) || 'Übung konnte nicht gelöscht werden.'
      showToast(msg, 'danger')
      return
    }
    showToast('Uebung geloescht', 'danger')
    await load()
    if (deepLinkRequestId) {
      const requestResolved = await markLinkedRequestResolved()
      if (requestResolved) {
        showToast('Anfrage automatisch als erledigt markiert.', 'success')
      } else {
        showToast('Änderung gespeichert, Anfrage bitte manuell prüfen.', 'info')
      }
    }
  }

  const toggleDay = (dayId: string) => {
    setExpandedDayId(prev => (prev === dayId ? null : dayId))
  }

  // ── Input class helpers ────────────────────────────────────────────────────
  const inputCls = 'w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]'
  const labelCls = 'block text-sm font-medium text-[#797D83] mb-1.5'

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/admin/plans" className="text-sm text-[#797D83] hover:text-[#EDECEA] flex items-center gap-1 mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Zurück zu Pläne
        </Link>
        <div className="bg-[#111318] rounded-2xl border border-white/[0.06] py-10 text-center">
          <p className="text-red-400 text-sm">{loadError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <Link href="/admin/plans" className="text-sm text-[#797D83] hover:text-[#EDECEA] flex items-center gap-1 mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Zurück zu Pläne
      </Link>

      {/* Plan Header */}
      <div className="bg-[#111318] rounded-2xl border border-white/[0.06] p-5 mb-6">
        {editingPlan ? (
          <div className="space-y-3">
            <input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              className="w-full text-xl font-bold bg-transparent border-b border-white/[0.08] pb-1 text-white focus:outline-none focus:border-[#A78BFA]/50"
            />
            <textarea
              value={planDesc}
              onChange={e => setPlanDesc(e.target.value)}
              placeholder="Beschreibung…"
              rows={2}
              className="w-full text-sm text-[#797D83] bg-[#0b0c0f] border border-white/[0.08] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent resize-none placeholder:text-[#555A61]"
            />
            <div className="flex gap-2">
              <button onClick={savePlan} className="px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-lg transition-colors">Speichern</button>
              <button onClick={() => setEditingPlan(false)} className="px-4 py-2 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-lg hover:bg-white/[0.04] transition-colors">Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">{plan?.name}</h1>
              {plan?.description && <p className="text-sm text-[#797D83] mt-1">{plan.description}</p>}
              <p className="text-xs text-[#555A61] mt-2">{days.length} Trainingstag{days.length !== 1 ? 'e' : ''}</p>
              {deepLinkRequestId && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#A78BFA]/10 px-2.5 py-1 text-[11px] font-medium text-[#A78BFA] ring-1 ring-[#A78BFA]/25">
                  Anfrage-Kontext aktiv
                </p>
              )}
            </div>
            <button onClick={() => setEditingPlan(true)} className="text-sm text-[#A78BFA] hover:text-[#B79FFB] px-3 py-1.5 rounded-lg hover:bg-[#A78BFA]/10 flex-shrink-0 transition-colors">Bearbeiten</button>
          </div>
        )}
      </div>

      {/* Days */}
      <div className="space-y-3 mb-4">
        {days.map((day, di) => (
          <div key={day.id} className="bg-[#111318] rounded-2xl border border-white/[0.06] overflow-hidden">
            {/* Day header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => toggleDay(day.id)}
            >
              <div className="w-8 h-8 rounded-lg bg-[#A78BFA]/20 text-[#A78BFA] flex items-center justify-center text-sm font-bold flex-shrink-0">
                {di + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm">{day.name}</div>
                {day.description && <div className="text-xs text-[#797D83] truncate">{day.description}</div>}
              </div>
              <div className="flex items-center gap-1 text-xs text-[#555A61]">
                <span>{exercises[day.id]?.length ?? 0} Übungen</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={e => { e.stopPropagation(); openEditDay(day) }} className="p-1.5 text-[#797D83] hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors">✏️</button>
                <button onClick={e => { e.stopPropagation(); deleteDay(day.id) }} className="p-1.5 text-[#797D83] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">🗑️</button>
              </div>
              <svg className={`w-4 h-4 text-[#555A61] transition-transform ${expandedDayId === day.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Exercises */}
            <Collapsible open={expandedDayId === day.id}>
              <div className="border-t border-white/[0.06]">
                {(exercises[day.id] ?? []).length === 0 ? (
                  <p className="text-sm text-[#555A61] px-5 py-4">Noch keine Übungen.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.04]">
                    {(exercises[day.id] ?? []).map((ex, ei) => (
                      <li
                        key={ex.id}
                        ref={(node) => { exerciseRefs.current[ex.id] = node }}
                        className={highlightExerciseId === ex.id ? 'bg-[#A78BFA]/10 ring-1 ring-inset ring-[#A78BFA]/35 transition-colors duration-500' : ''}
                      >
                        <StaggerItem index={ei} className="px-5 py-3 flex items-start gap-3">
                        <div className="w-6 h-6 rounded-md bg-white/[0.04] text-[#797D83] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          {ei + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-white">{ex.name}</div>
                          <div className="text-xs text-[#797D83] mt-0.5 flex flex-wrap gap-x-3">
                            <span>{ex.sets} Sätze × {ex.reps} Wdh.</span>
                            {ex.target_weight && <span>Zielgewicht: {ex.target_weight} kg</span>}
                            {ex.rest_seconds && <span>Pause: {ex.rest_seconds}s</span>}
                          </div>
                          {ex.note && <div className="text-xs text-[#A78BFA] mt-0.5">{ex.note}</div>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => openEditEx(ex)} className="p-1.5 text-[#797D83] hover:text-white hover:bg-white/[0.06] rounded-lg text-xs transition-colors">✏️</button>
                          <button onClick={() => deleteEx(ex.id)} className="p-1.5 text-[#797D83] hover:text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-colors">🗑️</button>
                        </div>
                        </StaggerItem>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-5 py-3 border-t border-white/[0.04]">
                  <button
                    onClick={() => openAddEx(day.id)}
                    className="text-sm text-[#A78BFA] hover:text-[#B79FFB] font-medium flex items-center gap-1 hover:bg-[#A78BFA]/10 px-3 py-1.5 rounded-lg transition-colors"
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
        className="w-full py-3 border-2 border-dashed border-white/[0.08] rounded-2xl text-sm font-medium text-[#555A61] hover:text-[#A78BFA] hover:border-[#A78BFA]/40 transition-colors"
      >
        + Trainingstag hinzufügen
      </button>

      {/* Day Modal */}
      {dayModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111318] border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h2 className="font-semibold text-white">{dayModal.editing ? 'Tag bearbeiten' : 'Neuer Trainingstag'}</h2>
            </div>
            <form onSubmit={saveDay} className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Name *</label>
                <input required autoFocus value={dayName} onChange={e => setDayName(e.target.value)} placeholder="z.B. Push, Pull, Legs" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Beschreibung</label>
                <input value={dayDesc} onChange={e => setDayDesc(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setDayModal({ open: false, editing: null })} className="flex-1 py-2.5 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-white/[0.04] transition-colors">Abbrechen</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exercise Modal */}
      {exModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#111318] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-2xl my-4">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h2 className="font-semibold text-white">{exModal.editing ? 'Übung bearbeiten' : 'Neue Übung'}</h2>
            </div>
            <form onSubmit={saveEx} className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Name *</label>
                <input required autoFocus value={exForm.name} onChange={e => setExForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Bankdrücken" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Beschreibung</label>
                <textarea value={exForm.description} onChange={e => setExForm(f => ({ ...f, description: e.target.value }))} placeholder="Ausführung, Hinweise…" rows={2} className={`${inputCls} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Sätze</label>
                  <input type="number" min={1} max={20} value={exForm.sets} onChange={e => setExForm(f => ({ ...f, sets: parseInt(e.target.value) || 1 }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Wiederholungen</label>
                  <input value={exForm.reps} onChange={e => setExForm(f => ({ ...f, reps: e.target.value }))} placeholder="10 oder 8-12" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Zielgewicht (kg)</label>
                  <input type="number" step="0.5" value={exForm.target_weight} onChange={e => setExForm(f => ({ ...f, target_weight: e.target.value }))} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Pause (Sekunden)</label>
                  <input type="number" value={exForm.rest_seconds} onChange={e => setExForm(f => ({ ...f, rest_seconds: e.target.value }))} placeholder="90" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notiz für Kunden</label>
                <input value={exForm.note} onChange={e => setExForm(f => ({ ...f, note: e.target.value }))} placeholder="Hinweis, Technik-Tipp…" className={inputCls} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setExModal({ open: false, dayId: '', editing: null })} className="flex-1 py-2.5 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-white/[0.04] transition-colors">Abbrechen</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors">Speichern</button>
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
