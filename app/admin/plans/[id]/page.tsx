'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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

// Temp id for draft-only items not yet persisted. Backend treats ids starting
// with "tmp" as "create" in PUT /plans/:id/full.
const tmpId = () => `tmp_${crypto.randomUUID()}`
const isTmp = (id: string) => id.startsWith('tmp')

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

type BackendDayReorderResponse = {
  ok?: boolean
  message?: string
  days?: Array<{
    id: string
    planId: string
    name: string
    description: string | null
    sortOrder: number
    createdAt: string
  }>
}

export default function PlanBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
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
  // Set when the edit modal was auto-opened for a freshly picked database exercise
  // that the trainer hasn't confirmed yet. Cancelling removes that exercise again.
  const [pendingNewExId, setPendingNewExId] = useState<string | null>(null)
  const [exForm, setExForm] = useState<ExerciseForm>(emptyExForm)
  const [pickerDayId, setPickerDayId] = useState<string | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<Exercise | null>(null)

  // Expanded day (single open accordion behavior)
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null)
  const [highlightExerciseId, setHighlightExerciseId] = useState<string | null>(null)
  const [linkedRequestResolved, setLinkedRequestResolved] = useState(false)
  const [dirty, setDirty] = useState(false)   // unsaved draft changes
  const [saving, setSaving] = useState(false)
  const [reorderingDayId, setReorderingDayId] = useState<string | null>(null)
  const deepLinkNoticeShownRef = useRef(false)
  const deepLinkExerciseKeyRef = useRef<string | null>(null)
  const deepLinkMissingTargetKeyRef = useRef<string | null>(null)
  const exerciseRefs = useRef<Record<string, HTMLLIElement | null>>({})

  const normalizeDayOrder = useCallback((dayList: WorkoutDay[]) => (
    dayList.map((day, index) => ({ ...day, sort_order: index }))
  ), [])

  // Map a backend plan response into local state. Shared by load() and the
  // batch-save response so tmp ids get replaced by real ids. Clears the dirty flag.
  const applyPlanPayload = useCallback((payload: BackendPlanDetailResponse) => {
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
      if (deepLinkDayId && mappedDays.some(d => d.id === deepLinkDayId)) return deepLinkDayId
      return prev && mappedDays.some(d => d.id === prev) ? prev : null
    })
    setDirty(false)
  }, [deepLinkDayId])

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

      applyPlanPayload(payload)
    } catch {
      setLoadError('Plan konnte nicht geladen werden.')
      setPlan(null)
      setDays([])
      setExercises({})
      setExpandedDayId(null)
    } finally {
      setLoading(false)
    }
  }, [applyPlanPayload, id])

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

  // Warn on browser/tab close when there are unsaved draft changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Commit the whole local draft via the batch endpoint. Resolves the linked
  // request (if any) in the same transaction. On success, remap from the response.
  const commitSave = async () => {
    if (saving) return
    const requestIdToSend = deepLinkRequestId && !linkedRequestResolved ? deepLinkRequestId : undefined

    const body = {
      name: plan?.name ?? planName,
      days: days.map(day => ({
        id: isTmp(day.id) ? null : day.id,
        name: day.name,
        description: day.description ?? null,
        exercises: (exercises[day.id] ?? []).map(ex => ({
          id: isTmp(ex.id) ? null : ex.id,
          name: ex.name,
          description: ex.description ?? null,
          sets: ex.sets,
          reps: ex.reps,
          targetWeightKg: ex.target_weight ?? null,
          restSeconds: ex.rest_seconds ?? null,
          note: ex.note ?? null,
          imageUrl: ex.image_url ?? null,
        })),
      })),
      ...(requestIdToSend ? { requestId: requestIdToSend } : {}),
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/backend/plans/${id}/full`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null) as BackendPlanDetailResponse | { message?: string } | null
      if (!response.ok || !payload || !('plan' in payload) || !payload.plan) {
        const msg =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : (payload && 'message' in payload && typeof payload.message === 'string' && payload.message) || 'Änderungen konnten nicht gespeichert werden.'
        showToast(msg, 'danger')
        return
      }
      applyPlanPayload(payload)
      if (requestIdToSend) setLinkedRequestResolved(true)
      showToast(
        requestIdToSend ? 'Plan gespeichert · Anfrage erledigt ✓' : 'Änderungen gespeichert ✓',
        'success',
      )
    } catch {
      showToast('Änderungen konnten nicht gespeichert werden.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  const discardChanges = () => { void load() }

  const handleBack = () => {
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return
    router.push('/admin/plans')
  }

  // Local draft only — persisted later via commitSave.
  const savePlan = () => {
    const trimmed = planName.trim()
    if (!trimmed) { showToast('Plan-Name darf nicht leer sein.', 'danger'); return }
    setPlan(p => p ? { ...p, name: trimmed, description: planDesc || null } : p)
    setEditingPlan(false)
    setDirty(true)
  }

  const openAddDay = () => { setDayModal({ open: true, editing: null }); setDayName(''); setDayDesc('') }
  const openEditDay = (day: WorkoutDay) => { setDayModal({ open: true, editing: day }); setDayName(day.name); setDayDesc(day.description ?? '') }

  // Local draft only.
  const saveDay = (e: React.FormEvent) => {
    e.preventDefault()
    const name = dayName.trim()
    if (!name) { showToast('Tag-Name darf nicht leer sein.', 'danger'); return }
    const description = dayDesc || null

    if (dayModal.editing) {
      const editingId = dayModal.editing.id
      setDays(prev => prev.map(d => d.id === editingId ? { ...d, name, description } : d))
    } else {
      const newDay = {
        id: tmpId(),
        plan_id: id,
        name,
        description,
        sort_order: days.length,
        created_at: new Date().toISOString(),
      } as WorkoutDay
      setDays(prev => [...prev, newDay])
      setExercises(prev => ({ ...prev, [newDay.id]: [] }))
      setExpandedDayId(newDay.id)
    }
    setDayModal({ open: false, editing: null })
    setDirty(true)
  }

  // Local draft only — removes the day and its exercises from state.
  const deleteDay = (dayId: string) => {
    if (!confirm('Trainingstag und alle Übungen aus dem Entwurf entfernen?')) return
    setDays(prev => prev.filter(d => d.id !== dayId))
    setExercises(prev => { const next = { ...prev }; delete next[dayId]; return next })
    setDirty(true)
  }

  const openAddEx = (dayId: string) => {
    setExpandedDayId(dayId)
    setPickerDayId(dayId)
  }

  function openEditEx(ex: Exercise) {
    setExpandedDayId(ex.day_id)
    setExModal({ open: true, dayId: ex.day_id, editing: ex })
    setExForm({
      name: ex.name, description: ex.description ?? '', sets: ex.sets, reps: ex.reps,
      target_weight: ex.target_weight?.toString() ?? '', rest_seconds: ex.rest_seconds?.toString() ?? '90', note: ex.note ?? '',
    })
  }

  // Local draft only — appends a new exercise with a tmp id, then immediately
  // opens the edit modal so the trainer sets sets/reps/weight/rest/note. dirty is
  // only set on Übernehmen (saveEx); Abbrechen removes the unconfirmed exercise.
  const addPickedExercise = (exercise: LibraryExercise) => {
    const dayId = pickerDayId
    if (!dayId) return
    const list = exercises[dayId] ?? []
    const newEx = {
      id: tmpId(),
      day_id: dayId,
      name: exercise.name,
      description: null,
      sets: 3,
      reps: '10',
      target_weight: null,
      rest_seconds: 60,
      note: null,
      sort_order: list.length,
      image_url: exercise.image_url ?? null,
      library_id: exercise.id,
      created_at: new Date().toISOString(),
    } as Exercise
    setExercises(prev => ({ ...prev, [dayId]: [...(prev[dayId] ?? []), newEx] }))
    setPickerDayId(null)

    // Auto-open "Übung bearbeiten" on the freshly picked exercise (name prefilled).
    setPendingNewExId(newEx.id)
    setExpandedDayId(dayId)
    setExModal({ open: true, dayId, editing: newEx })
    setExForm({
      name: newEx.name,
      description: '',
      sets: newEx.sets,
      reps: newEx.reps,
      target_weight: '',
      rest_seconds: String(newEx.rest_seconds ?? 60),
      note: '',
    })
  }

  const openReplaceEx = (ex: Exercise) => {
    setExpandedDayId(ex.day_id)
    setReplaceTarget(ex)
  }

  // Local draft only — reorders the array; persisted later via commitSave.
  const moveExercise = (dayId: string, index: number, direction: -1 | 1) => {
    const list = exercises[dayId] ?? []
    const target = index + direction
    if (target < 0 || target >= list.length) return

    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)

    setExercises(prev => ({ ...prev, [dayId]: reordered }))
    setDirty(true)
  }

  // Local draft only — name + imageUrl from the NEW exercise; programming
  // (sets/reps/rest/target/note) of the OLD exercise kept; description cleared.
  // Same id (real or tmp) and position preserved.
  const replacePickedExercise = (exercise: LibraryExercise) => {
    const target = replaceTarget
    if (!target) return
    setExercises(prev => ({
      ...prev,
      [target.day_id]: (prev[target.day_id] ?? []).map(ex =>
        ex.id === target.id
          ? { ...ex, name: exercise.name, image_url: exercise.image_url ?? null, description: null, library_id: exercise.id }
          : ex,
      ),
    }))
    setReplaceTarget(null)
    setDirty(true)
  }

  // Local draft only — updates an existing exercise or appends a new one (tmp id).
  const saveEx = (e: React.FormEvent) => {
    e.preventDefault()
    const name = exForm.name.trim()
    if (!name) { showToast('Übungs-Name darf nicht leer sein.', 'danger'); return }
    const fields = {
      name,
      description: exForm.description || null,
      sets: exForm.sets,
      reps: exForm.reps,
      target_weight: exForm.target_weight ? parseFloat(exForm.target_weight) : null,
      rest_seconds: exForm.rest_seconds ? parseInt(exForm.rest_seconds) : 90,
      note: exForm.note || null,
    }

    if (exModal.editing) {
      const editing = exModal.editing
      setExercises(prev => ({
        ...prev,
        [editing.day_id]: (prev[editing.day_id] ?? []).map(ex =>
          ex.id === editing.id ? { ...ex, ...fields } : ex,
        ),
      }))
    } else {
      const dayId = exModal.dayId
      const list = exercises[dayId] ?? []
      const newEx = {
        id: tmpId(),
        day_id: dayId,
        ...fields,
        sort_order: list.length,
        image_url: null,
        library_id: null,
        created_at: new Date().toISOString(),
      } as Exercise
      setExercises(prev => ({ ...prev, [dayId]: [...(prev[dayId] ?? []), newEx] }))
    }
    setExModal({ open: false, dayId: '', editing: null })
    setPendingNewExId(null)
    setDirty(true)
  }

  // Cancel the exercise modal. If it was auto-opened for a freshly picked database
  // exercise that wasn't confirmed yet, remove it so no half-finished exercise
  // stays in the plan. Normal edits just close without touching the exercise.
  const cancelExModal = () => {
    const removeId = pendingNewExId
    if (removeId) {
      setExercises(prev => {
        const next: Record<string, Exercise[]> = {}
        for (const [dayId, list] of Object.entries(prev)) {
          next[dayId] = list.filter(ex => ex.id !== removeId)
        }
        return next
      })
      setPendingNewExId(null)
    }
    setExModal({ open: false, dayId: '', editing: null })
  }

  // Local draft only — removes the exercise from state.
  const deleteEx = (exId: string) => {
    if (!confirm('Übung aus dem Entwurf entfernen?')) return
    setExercises(prev => {
      const next: Record<string, Exercise[]> = {}
      for (const [dayId, list] of Object.entries(prev)) {
        next[dayId] = list.filter(ex => ex.id !== exId)
      }
      return next
    })
    setDirty(true)
  }

  const toggleDay = (dayId: string) => {
    setExpandedDayId(prev => (prev === dayId ? null : dayId))
  }

  const moveDay = async (index: number, direction: -1 | 1) => {
    if (reorderingDayId) return

    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= days.length) return

    const previousDays = days
    const reorderedDays = [...days]
    const [movedDay] = reorderedDays.splice(index, 1)
    reorderedDays.splice(targetIndex, 0, movedDay)

    const normalizedDays = normalizeDayOrder(reorderedDays)
    const hadDirty = dirty
    const hasTmpDays = normalizedDays.some(day => isTmp(day.id))

    setDays(normalizedDays)

    if (hasTmpDays) {
      setDirty(true)
      showToast('Reihenfolge wird mit dem naechsten Speichern uebernommen.', 'info')
      return
    }

    setReorderingDayId(movedDay.id)
    try {
      const response = await fetch(`/api/backend/plans/${id}/days/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIds: normalizedDays.map(day => day.id) }),
      })

      const payload = (await response.json().catch(() => null)) as BackendDayReorderResponse | null
      if (!response.ok || !payload?.ok) {
        setDays(previousDays)
        setDirty(hadDirty)
        const message =
          response.status === 401
            ? 'Backend-Login erforderlich.'
            : payload?.message || 'Reihenfolge konnte nicht gespeichert werden.'
        showToast(message, 'danger')
        return
      }

      setDays(normalizedDays)
      setDirty(hadDirty)
      showToast('Reihenfolge gespeichert.', 'success')
    } catch {
      setDays(previousDays)
      setDirty(hadDirty)
      showToast('Reihenfolge konnte nicht gespeichert werden.', 'danger')
    } finally {
      setReorderingDayId(null)
    }
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
      <button type="button" onClick={handleBack} className="text-sm text-[#797D83] hover:text-[#EDECEA] flex items-center gap-1 mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Zurück zu Pläne
      </button>

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
              <button onClick={savePlan} className="px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-lg transition-colors">Übernehmen</button>
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
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Always-visible save status: shows progress and lets the trainer
                  commit the local draft (reuses commitSave — no duplicate path). */}
              <button
                type="button"
                onClick={commitSave}
                disabled={saving || !dirty}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                  dirty
                    ? 'bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] shadow-[0_4px_16px_-4px_rgba(167,139,250,0.45)]'
                    : 'bg-white/[0.04] text-[#797D83] cursor-default'
                }`}
              >
                {saving ? 'Speichert…' : dirty ? 'Speichern' : 'Gespeichert ✓'}
              </button>
              <button onClick={() => setEditingPlan(true)} className="text-sm text-[#A78BFA] hover:text-[#B79FFB] px-3 py-1.5 rounded-lg hover:bg-[#A78BFA]/10 transition-colors">Bearbeiten</button>
            </div>
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
                <button
                  onClick={e => { e.stopPropagation(); void moveDay(di, -1) }}
                  disabled={di === 0 || reorderingDayId !== null}
                  title="Tag nach oben"
                  aria-label="Tag nach oben"
                  className="p-1.5 text-[#797D83] hover:text-[#A78BFA] hover:bg-[#A78BFA]/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#797D83]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); void moveDay(di, 1) }}
                  disabled={di === days.length - 1 || reorderingDayId !== null}
                  title="Tag nach unten"
                  aria-label="Tag nach unten"
                  className="p-1.5 text-[#797D83] hover:text-[#A78BFA] hover:bg-[#A78BFA]/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#797D83]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
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
                          <button
                            onClick={() => moveExercise(day.id, ei, -1)}
                            disabled={ei === 0}
                            title="Nach oben"
                            aria-label="Nach oben"
                            className="p-1.5 text-[#797D83] hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#797D83]"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                          </button>
                          <button
                            onClick={() => moveExercise(day.id, ei, 1)}
                            disabled={ei === (exercises[day.id] ?? []).length - 1}
                            title="Nach unten"
                            aria-label="Nach unten"
                            className="p-1.5 text-[#797D83] hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#797D83]"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                          </button>
                          <button onClick={() => openEditEx(ex)} title="Bearbeiten" className="p-1.5 text-[#797D83] hover:text-white hover:bg-white/[0.06] rounded-lg text-xs transition-colors">✏️</button>
                          <button onClick={() => openReplaceEx(ex)} title="Durch andere Übung ersetzen" aria-label="Ersetzen" className="p-1.5 text-[#797D83] hover:text-[#A78BFA] hover:bg-[#A78BFA]/10 rounded-lg transition-colors">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 8h12l-3-3M20 16H8l3 3" />
                            </svg>
                          </button>
                          <button onClick={() => deleteEx(ex.id)} title="Löschen" className="p-1.5 text-[#797D83] hover:text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-colors">🗑️</button>
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

      {/* Spacer so the sticky action bar never covers content */}
      {dirty && <div className="h-24" />}

      {/* Sticky draft action bar — only while there are unsaved changes */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-[#0b0c0f]/95 backdrop-blur-md">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[#A78BFA] font-medium">Ungespeicherte Änderungen</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardChanges}
                disabled={saving}
                className="press px-4 py-2 border border-white/[0.08] text-[#797D83] hover:text-[#EDECEA] text-sm font-medium rounded-xl hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
              >
                Änderungen verwerfen
              </button>
              <button
                type="button"
                onClick={commitSave}
                disabled={saving}
                className="press px-5 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shadow-[0_4px_16px_-4px_rgba(167,139,250,0.45)]"
              >
                {saving ? 'Speichern…' : 'Änderungen speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <button type="submit" className="flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors">Übernehmen</button>
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
                  <input type="text" value={exForm.reps} onChange={e => setExForm(f => ({ ...f, reps: e.target.value }))} placeholder="z.B. 10 oder 8-12" className={inputCls} />
                  <p className="text-xs text-[#555A61] mt-1.5">Du kannst auch Bereiche wie 8-12 oder AMRAP eingeben.</p>
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
                <button type="button" onClick={cancelExModal} className="flex-1 py-2.5 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-white/[0.04] transition-colors">Abbrechen</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors">Übernehmen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ExercisePicker
        open={pickerDayId !== null || replaceTarget !== null}
        onClose={() => { setPickerDayId(null); setReplaceTarget(null) }}
        onSelect={replaceTarget ? replacePickedExercise : addPickedExercise}
      />
    </div>
  )
}
