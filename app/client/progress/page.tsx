'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { CheckinImage, ClientGender, ProgressLog, WeeklyCheckin } from '@/lib/types'
import {
  buildBodyWeightHistory,
  summarizeBodyWeightPeriod,
  type BodyWeightPeriod,
} from '@/lib/body-weight'
import {
  buildExerciseProgress,
  type ExerciseProgressSeries,
} from '@/lib/exercise-progress'
import Lightbox from '@/components/Lightbox'
import { AnimatedNumber, useToast } from '@/components/Motion'
import { EmptyState } from '@/components/ui/client-ui'
import PeriodTracker from './PeriodTracker'

// ─── Local types ─────────────────────────────────────────────────────────────

type ExerciseLogItem = {
  actual_weight: number | null
  actual_reps: string | null
  sets_done: number | null
  completed: boolean
  exercise: { name: string } | null
}

type WorkoutLogItem = {
  id: string
  date: string
  completed_at: string | null
  workout_day: { name: string } | null
  exercise_logs: ExerciseLogItem[]
}

type PersonalRecord = {
  name: string
  weight: number
  reps: string
  date: string
}

const WEIGHT_PERIODS: { key: BodyWeightPeriod; shortLabel: string; label: string }[] = [
  { key: 'week', shortLabel: '1 W', label: '1 Woche' },
  { key: 'month', shortLabel: '1 M', label: '1 Monat' },
  { key: 'quarter', shortLabel: '3 M', label: '3 Monate' },
  { key: 'year', shortLabel: '1 J', label: '1 Jahr' },
]

// ─── Backend checkin shape ────────────────────────────────────────────────────

type BackendCheckinImage = {
  id: string
  checkinId: string
  storagePath: string
  createdAt: string
}

type BackendCheckin = {
  id: string
  clientId: string
  weekStart: string
  mood: number | null
  energy: number | null
  sleepQuality: number | null
  hunger: number | null
  stress: number | null
  bodyWeight: number | null
  comment: string | null
  createdAt: string
  updatedAt: string
  images: BackendCheckinImage[]
}

function mapCheckin(c: BackendCheckin): WeeklyCheckin {
  return {
    id: c.id,
    client_id: c.clientId,
    week_start: c.weekStart,
    mood: c.mood,
    energy: c.energy,
    sleep_quality: c.sleepQuality,
    hunger: c.hunger,
    stress: c.stress,
    body_weight: c.bodyWeight,
    comment: c.comment,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    checkin_images: c.images.map(img => ({
      id: img.id,
      checkin_id: img.checkinId,
      storage_path: img.storagePath,
      created_at: img.createdAt,
    })),
  }
}

// ─── Backend progress log shape ───────────────────────────────────────────────

type BackendProgressLog = {
  id: string
  clientId: string
  date: string
  bodyWeight: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

function mapProgressLog(p: BackendProgressLog): ProgressLog {
  return {
    id: p.id,
    client_id: p.clientId,
    date: p.date,
    body_weight: p.bodyWeight,
    notes: p.notes,
    created_at: p.createdAt,
  }
}

// ─── Backend workout log shape ────────────────────────────────────────────────

type BackendExerciseLog = {
  actualWeight: number | null
  actualReps: string | null
  setsDone: number | null
  completed: boolean
  exercise: { name: string } | null
}

type BackendWorkoutLog = {
  id: string
  dayId: string
  date: string
  completedAt: string | null
  createdAt: string
  day: { id: string; name: string; plan: { id: string; name: string } } | null
  exerciseLogs: BackendExerciseLog[]
}

function mapWorkoutLog(w: BackendWorkoutLog): WorkoutLogItem {
  return {
    id: w.id,
    date: w.date,
    completed_at: w.completedAt,
    workout_day: w.day ? { name: w.day.name } : null,
    exercise_logs: w.exerciseLogs.map(el => ({
      actual_weight: el.actualWeight,
      actual_reps: el.actualReps,
      sets_done: el.setsDone,
      completed: el.completed,
      exercise: el.exercise,
    })),
  }
}

// ─── Image URL resolution ─────────────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000'

function resolveCheckinImageUrl(storagePath: string): string | null {
  if (!storagePath) return null
  if (storagePath.startsWith('http')) return storagePath
  if (storagePath.startsWith('/uploads')) return `${BACKEND_URL}${storagePath}`
  return null
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function calcStreak(dates: string[]): number {
  if (!dates.length) return 0
  const weeks = new Set(dates.map(d => getMonday(new Date(d))))
  let streak = 0
  const cursor = new Date(getMonday(new Date()))
  while (weeks.has(cursor.toISOString().split('T')[0])) {
    streak++
    cursor.setDate(cursor.getDate() - 7)
  }
  return streak
}

function calcPRs(logs: WorkoutLogItem[]): PersonalRecord[] {
  const records: Record<string, PersonalRecord> = {}
  for (const log of logs) {
    for (const el of log.exercise_logs) {
      if (!el.exercise || !el.actual_weight || !el.completed) continue
      const name = el.exercise.name
      const existing = records[name]
      if (!existing || el.actual_weight > existing.weight) {
        records[name] = { name, weight: el.actual_weight, reps: el.actual_reps ?? '?', date: log.date }
      }
    }
  }
  return Object.values(records).sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Chart components ─────────────────────────────────────────────────────────

function SvgLineChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length < 2) return null
  const W = 320, H = 100
  const P = { t: 8, r: 10, b: 24, l: 40 }
  const iW = W - P.l - P.r, iH = H - P.t - P.b
  const vals = data.map(d => d.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 0.1
  const px = (i: number) => P.l + (i / (data.length - 1)) * iW
  const py = (v: number) => P.t + iH - ((v - min) / range) * iH
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(d.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${px(data.length - 1).toFixed(1)},${(P.t + iH).toFixed(1)} L${P.l.toFixed(1)},${(P.t + iH).toFixed(1)} Z`
  const fmt = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
      <path d={areaPath} fill="#A78BFA" fillOpacity="0.08" />
      <line x1={P.l} y1={py(min)} x2={W - P.r} y2={py(min)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1={P.l} y1={py(max)} x2={W - P.r} y2={py(max)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <path d={linePath} fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.value)} r="3" fill="#111111" stroke="#A78BFA" strokeWidth="2" />
      ))}
      <text x={P.l - 4} y={py(max) + 4} textAnchor="end" fontSize="9" fill="#797D83">{max.toFixed(1)}</text>
      <text x={P.l - 4} y={py(min) + 4} textAnchor="end" fontSize="9" fill="#797D83">{min.toFixed(1)}</text>
      <text x={px(0)} y={H - 4} textAnchor="middle" fontSize="9" fill="#797D83">{fmt(data[0].label)}</text>
      <text x={px(data.length - 1)} y={H - 4} textAnchor="middle" fontSize="9" fill="#797D83">{fmt(data[data.length - 1].label)}</text>
    </svg>
  )
}

function formatExerciseValue(value: number, metric: ExerciseProgressSeries['metric']): string {
  const formatted = value.toLocaleString('de-DE', { maximumFractionDigits: 1 })
  return metric === 'weight' ? `${formatted} kg` : `${formatted} Wdh.`
}

function ExerciseProgressChart({ series }: { series: ExerciseProgressSeries }) {
  const data = series.points.slice(-12)
  const width = 360
  const height = 178
  const padding = { top: 18, right: 12, bottom: 30, left: 42 }
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const rawMin = Math.min(...data.map(point => point.value))
  const rawMax = Math.max(...data.map(point => point.value))
  const fallbackRange = Math.max(rawMax * 0.12, 1)
  const min = rawMin === rawMax ? Math.max(0, rawMin - fallbackRange) : rawMin
  const max = rawMin === rawMax ? rawMax + fallbackRange : rawMax
  const range = max - min
  const x = (index: number) => data.length === 1
    ? padding.left + innerWidth / 2
    : padding.left + (index / (data.length - 1)) * innerWidth
  const y = (value: number) => padding.top + innerHeight - ((value - min) / range) * innerHeight
  const coordinates = data.map((point, index) => ({
    x: x(index),
    y: y(point.value),
    point,
  }))
  const linePath = coordinates.length === 1
    ? `M${coordinates[0].x},${coordinates[0].y}`
    : coordinates.reduce((path, coordinate, index) => {
        if (index === 0) return `M${coordinate.x},${coordinate.y}`
        const previous = coordinates[index - 1]
        const middleX = (previous.x + coordinate.x) / 2
        return `${path} C${middleX},${previous.y} ${middleX},${coordinate.y} ${coordinate.x},${coordinate.y}`
      }, '')
  const chartBottom = padding.top + innerHeight
  const areaPath = coordinates.length > 1
    ? `${linePath} L${coordinates[coordinates.length - 1].x},${chartBottom} L${coordinates[0].x},${chartBottom} Z`
    : ''
  const formatDate = (date: string) => new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  })
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full overflow-visible"
      role="img"
      aria-label={`Leistungsverlauf für ${series.name}`}
    >
      <defs>
        <linearGradient id="exercise-progress-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map(ratio => {
        const gridY = padding.top + innerHeight * ratio
        const value = max - range * ratio
        return (
          <g key={ratio}>
            <line
              x1={padding.left}
              y1={gridY}
              x2={width - padding.right}
              y2={gridY}
              stroke="rgba(255,255,255,0.07)"
              strokeDasharray="3 4"
            />
            <text
              x={padding.left - 7}
              y={gridY + 3}
              textAnchor="end"
              fontSize="9"
              fill="#797D83"
            >
              {value.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
            </text>
          </g>
        )
      })}
      {areaPath && <path d={areaPath} fill="url(#exercise-progress-area)" />}
      <path
        d={linePath}
        fill="none"
        stroke="#A78BFA"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coordinates.map(({ x: pointX, y: pointY, point }, index) => {
        const isLatest = index === coordinates.length - 1
        return (
          <g key={point.workoutId}>
            {isLatest && <circle cx={pointX} cy={pointY} r="8" fill="#A78BFA" fillOpacity="0.15" />}
            <circle
              cx={pointX}
              cy={pointY}
              r={isLatest ? 4 : 3}
              fill={isLatest ? '#A78BFA' : '#111111'}
              stroke="#A78BFA"
              strokeWidth="2"
            >
              <title>{`${formatDate(point.date)} · ${formatExerciseValue(point.value, series.metric)}`}</title>
            </circle>
          </g>
        )
      })}
      {labelIndexes.map(index => (
        <text
          key={index}
          x={x(index)}
          y={height - 6}
          textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
          fontSize="9"
          fill="#797D83"
        >
          {formatDate(data[index].date)}
        </text>
      ))}
    </svg>
  )
}

// ─── Check-in subcomponents ───────────────────────────────────────────────────

function RatingButtons({ value, onChange, emojis }: {
  value: number
  onChange: (v: number) => void
  emojis: string[]
}) {
  return (
    <div className="flex gap-1.5">
      {emojis.map((emoji, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-base transition-all ${
            value === i + 1
              ? 'bg-[#A78BFA]/10 ring-1 ring-[#A78BFA]/60'
              : 'bg-white/[0.04] hover:bg-white/[0.07]'
          }`}
        >
          <span>{emoji}</span>
          <span className="text-[10px] text-[#797D83]">{i + 1}</span>
        </button>
      ))}
    </div>
  )
}

function RatingBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (!value) return null
  const color = value >= 4 ? 'text-[#A78BFA] bg-[#A78BFA]/10' : value >= 3 ? 'text-amber-400 bg-amber-400/10' : 'text-red-400 bg-red-400/10'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#797D83] w-20 flex-shrink-0">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${color}`}>{value}/5</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'exercises' | 'cycle' | 'checkin' | 'records'

export default function ProgressPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientTrainerId, setClientTrainerId] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string>('')
  const [clientGender, setClientGender] = useState<ClientGender | null>(null)
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([])
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLogItem[]>([])
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [tab, setTab] = useState<Tab>('overview')
  const [selectedExerciseName, setSelectedExerciseName] = useState('')
  const [weightPeriod, setWeightPeriod] = useState<BodyWeightPeriod>('month')

  // Check-in form
  const [showCheckinForm, setShowCheckinForm] = useState(false)
  const [ciMood, setCiMood] = useState(0)
  const [ciEnergy, setCiEnergy] = useState(0)
  const [ciSleep, setCiSleep] = useState(0)
  const [ciHunger, setCiHunger] = useState(0)
  const [ciStress, setCiStress] = useState(0)
  const [ciWeight, setCiWeight] = useState('')
  const [ciComment, setCiComment] = useState('')
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [checkinError, setCheckinError] = useState<string | null>(null)
  const [checkinSuccess, setCheckinSuccess] = useState(false)

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ciFiles, setCiFiles] = useState<File[]>([])
  const [ciPreviews, setCiPreviews] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Lightbox
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([])
  const [lightboxIdx, setLightboxIdx] = useState(0)

  const load = useCallback(async () => {
    try {
      const [summaryFetch, progressFetch, checkinsFetch] = await Promise.all([
        fetch('/api/backend/me/progress-summary?limit=100', { cache: 'no-store' }),
        fetch('/api/backend/me/progress-logs?limit=500', { cache: 'no-store' }),
        fetch('/api/backend/me/checkins?limit=60', { cache: 'no-store' }),
      ])

      const summaryData = summaryFetch.ok ? await summaryFetch.json().catch(() => null) : null
      if (!summaryData?.client) { setLoading(false); return }
      setClientId(summaryData.client.id)
      setClientTrainerId(summaryData.client.trainerId ?? null)
      setClientName(summaryData.client.fullName ?? '')
      setClientGender(summaryData.client.gender ?? null)
      setTotalWorkouts(summaryData.workoutSummary?.completedWorkoutCount ?? 0)
      setWorkoutLogs(((summaryData.workoutSummary?.recentWorkouts ?? []) as BackendWorkoutLog[]).map(mapWorkoutLog))

      const progressData = progressFetch.ok ? await progressFetch.json().catch(() => null) : null
      setProgressLogs(((progressData?.progressLogs ?? []) as BackendProgressLog[]).map(mapProgressLog))

      const checkinsData = checkinsFetch.ok ? await checkinsFetch.json().catch(() => null) : null
      setCheckins(((checkinsData?.checkins ?? []) as BackendCheckin[]).map(mapCheckin))

      setLoading(false)
    } catch (err) {
      console.error('[Progress] load failed:', err)
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Derived data ──────────────────────────────────────────────────────────

  const streak = useMemo(() => calcStreak(workoutLogs.map(l => l.date)), [workoutLogs])
  const prs = useMemo(() => calcPRs(workoutLogs), [workoutLogs])
  const exerciseProgress = useMemo(
    () => buildExerciseProgress(workoutLogs.map(log => ({
      id: log.id,
      date: log.date,
      completedAt: log.completed_at,
      workoutName: log.workout_day?.name ?? null,
      exerciseLogs: log.exercise_logs.map(exerciseLog => ({
        weight: exerciseLog.actual_weight,
        reps: exerciseLog.actual_reps,
        completed: exerciseLog.completed,
        exerciseName: exerciseLog.exercise?.name ?? null,
      })),
    }))),
    [workoutLogs],
  )
  const selectedExercise = useMemo(
    () => exerciseProgress.find(series => series.name === selectedExerciseName) ?? exerciseProgress[0] ?? null,
    [exerciseProgress, selectedExerciseName],
  )
  const bodyWeightHistory = useMemo(
    () => buildBodyWeightHistory(
      progressLogs.map(log => ({
        id: log.id,
        date: log.date,
        bodyWeight: log.body_weight,
        createdAt: log.created_at,
        notes: log.notes,
      })),
      checkins.map(checkin => ({
        id: checkin.id,
        bodyWeight: checkin.body_weight,
        createdAt: checkin.created_at,
        updatedAt: checkin.updated_at,
      })),
    ),
    [checkins, progressLogs],
  )
  const visibleProgressLogs = useMemo<ProgressLog[]>(
    () => bodyWeightHistory.map(entry => ({
      id: entry.id,
      client_id: clientId ?? '',
      date: entry.date,
      body_weight: entry.bodyWeight,
      notes: entry.notes,
      created_at: entry.createdAt,
    })),
    [bodyWeightHistory, clientId],
  )
  const weightPeriodSummary = useMemo(
    () => summarizeBodyWeightPeriod(bodyWeightHistory, weightPeriod),
    [bodyWeightHistory, weightPeriod],
  )
  const chartData = useMemo(
    () => [...weightPeriodSummary.entries].reverse().map(entry => ({
      label: entry.date,
      value: entry.bodyWeight,
    })),
    [weightPeriodSummary],
  )

  const thisWeekStart = getMonday(new Date())
  const alreadyCheckedIn = checkins.some(c => c.week_start === thisWeekStart)
  const thisWeekCheckin = checkins.find(c => c.week_start === thisWeekStart)

  const latestWeight = visibleProgressLogs[0]?.body_weight
  const weightChange = weightPeriodSummary.change
  const weightPeriodLabel = WEIGHT_PERIODS.find(period => period.key === weightPeriod)?.label ?? 'Zeitraum'

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const openEditCheckin = () => {
    if (thisWeekCheckin) {
      setCiMood(thisWeekCheckin.mood ?? 0)
      setCiEnergy(thisWeekCheckin.energy ?? 0)
      setCiSleep(thisWeekCheckin.sleep_quality ?? 0)
      setCiHunger(thisWeekCheckin.hunger ?? 0)
      setCiStress(thisWeekCheckin.stress ?? 0)
      setCiWeight(thisWeekCheckin.body_weight ? String(thisWeekCheckin.body_weight) : '')
      setCiComment(thisWeekCheckin.comment ?? '')
    }
    setCiFiles([])
    setCiPreviews([])
    setCheckinError(null)
    setCheckinSuccess(false)
    setShowCheckinForm(true)
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    const maxPerCheckin = 5
    const existingCount = thisWeekCheckin?.checkin_images?.length ?? 0
    const slots = maxPerCheckin - existingCount - ciFiles.length
    if (slots <= 0) return

    const added = Array.from(fileList)
      .filter(f => allowed.includes(f.type) && f.size <= 10 * 1024 * 1024)
      .slice(0, slots)

    setCiFiles(prev => [...prev, ...added])
    setCiPreviews(prev => [...prev, ...added.map(f => URL.createObjectURL(f))])
  }

  const removeNewFile = (index: number) => {
    URL.revokeObjectURL(ciPreviews[index])
    setCiFiles(prev => prev.filter((_, i) => i !== index))
    setCiPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSaveCheckin = async (e: React.FormEvent) => {
    e.preventDefault()
    setCheckinError(null)

    const rawWeight = ciWeight.trim()
    const normalizedWeight = rawWeight.replace(',', '.')
    let safeWeight: number | null = null

    if (normalizedWeight) {
      const parsedWeight = Number(normalizedWeight)
      if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
        setCheckinError('Bitte gib ein gültiges Gewicht ein (z. B. 82,5 oder 82.5).')
        return
      }
      safeWeight = parsedWeight
    }

    setSavingCheckin(true)

    try {
      const res = await fetch('/api/backend/me/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: thisWeekStart,
          mood: ciMood || null,
          energy: ciEnergy || null,
          sleepQuality: ciSleep || null,
          hunger: ciHunger || null,
          stress: ciStress || null,
          bodyWeight: safeWeight,
          comment: ciComment || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setCheckinError((data as { message?: string } | null)?.message ?? 'Speichern fehlgeschlagen.')
        return
      }

      const responseData = await res.json().catch(() => null)
      const savedCheckinId = (responseData as { checkin?: { id?: string } } | null)?.checkin?.id ?? null

      if (savedCheckinId && ciFiles.length > 0) {
        setUploadProgress('Bilder werden hochgeladen…')
        const fd = new FormData()
        ciFiles.forEach(f => fd.append('images', f))
        const imgRes = await fetch(`/api/backend/me/checkins/${savedCheckinId}/images`, {
          method: 'POST',
          body: fd,
        })
        if (!imgRes.ok) {
          const imgData = await imgRes.json().catch(() => null)
          setCheckinError((imgData as { message?: string } | null)?.message ?? 'Bild-Upload fehlgeschlagen.')
        }
      }

      setCiMood(0); setCiEnergy(0); setCiSleep(0)
      setCiHunger(0); setCiStress(0); setCiWeight(''); setCiComment('')
      ciPreviews.forEach(p => URL.revokeObjectURL(p))
      setCiFiles([])
      setCiPreviews([])
      setShowCheckinForm(false)
      setCheckinSuccess(true)
      showToast('Check-in gespeichert ✓', 'success')
      setTimeout(() => setCheckinSuccess(false), 4000)

      await load()
    } catch (err) {
      console.error('[Check-in] unexpected error:', err)
      setCheckinError('Unerwarteter Fehler. Bitte Seite neu laden und erneut versuchen.')
    } finally {
      setSavingCheckin(false)
      setUploadProgress('')
    }
  }

  const openLightbox = (images: CheckinImage[], startIndex: number) => {
    const urls = images.map(img => resolveCheckinImageUrl(img.storage_path)).filter((u): u is string => u !== null)
    if (!urls.length) return
    setLightboxUrls(urls)
    setLightboxIdx(startIndex)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!clientId) {
    return (
      <div className="p-4 max-w-[480px] mx-auto">
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
          <EmptyState
            icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path d="M14.828 14.828a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.1 1.1" /></svg>}
            title="Noch nicht verbunden"
            subtext="Dein Konto ist noch nicht mit einem Trainer verknüpft."
          />
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'exercises', label: 'Übungen' },
    ...(clientGender === 'FEMALE' ? [{ key: 'cycle' as const, label: 'Zyklus' }] : []),
    { key: 'checkin', label: 'Check-in' },
    { key: 'records', label: 'Rekorde' },
  ]

  return (
    <div className="px-4 pt-4 pb-8 max-w-[480px] mx-auto">
      {lightboxUrls.length > 0 && (
        <Lightbox
          urls={lightboxUrls}
          startIndex={lightboxIdx}
          onClose={() => setLightboxUrls([])}
        />
      )}

      <h1 className="text-display mb-4">Fortschritt</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#111111] border border-white/[0.06] p-1 rounded-xl mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`press flex-1 py-2 text-[13px] font-medium rounded-lg transition-colors ${
              tab === t.key
                ? 'bg-[#A78BFA] text-[#050504] shadow-sm'
                : 'text-[#797D83] hover:text-[#EDECEA]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ÜBERSICHT ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-4 text-center">
              <div className="text-[20px] font-bold text-[#EDECEA] tabular-nums">
                {latestWeight ? <AnimatedNumber value={latestWeight} decimals={1} /> : '–'}
              </div>
              <div className="text-[11px] text-[#797D83] mt-0.5">kg aktuell</div>
            </div>
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-4 text-center">
              <div className="text-[20px] font-bold text-[#EDECEA] tabular-nums">
                <AnimatedNumber value={totalWorkouts} />
              </div>
              <div className="text-[11px] text-[#797D83] mt-0.5">Trainings</div>
            </div>
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-4 text-center">
              <div className={`text-[20px] font-bold tabular-nums ${streak > 0 ? 'text-[#A78BFA]' : 'text-[#797D83]'}`}>
                {streak > 0 ? <AnimatedNumber value={streak} /> : '–'}
              </div>
              <div className="text-[11px] text-[#797D83] mt-0.5">Streak</div>
            </div>
          </div>

          {/* Weight chart */}
          <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-[#EDECEA] text-[13px]">Gewichtsverlauf</h3>
                {weightChange !== null ? (
                  <p className={`text-[11px] mt-0.5 font-medium ${weightChange < 0 ? 'text-[#A78BFA]' : weightChange > 0 ? 'text-red-400' : 'text-[#797D83]'}`}>
                    {weightChange < 0
                      ? `${Math.abs(weightChange).toFixed(1)} kg verloren`
                      : weightChange > 0
                        ? `+${weightChange.toFixed(1)} kg`
                        : 'Keine Veränderung'}{' · '}{weightPeriodLabel}
                  </p>
                ) : (
                  <p className="text-[11px] mt-0.5 text-[#797D83]">Noch kein Vergleich · {weightPeriodLabel}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 bg-[#080808] border border-white/[0.05] rounded-xl p-1 mb-4" aria-label="Zeitraum für Gewichtsverlauf">
              {WEIGHT_PERIODS.map(period => (
                <button
                  key={period.key}
                  type="button"
                  onClick={() => setWeightPeriod(period.key)}
                  aria-pressed={weightPeriod === period.key}
                  aria-label={period.label}
                  className={`press py-2 rounded-lg text-[11px] font-semibold transition-all ${
                    weightPeriod === period.key
                      ? 'bg-[#A78BFA] text-[#050504] shadow-[0_3px_10px_rgba(167,139,250,0.2)]'
                      : 'text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.04]'
                  }`}
                >
                  {period.shortLabel}
                </button>
              ))}
            </div>
            {chartData.length >= 2 ? (
              <SvgLineChart data={chartData} />
            ) : (
              <EmptyState
                icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>}
                title="Zu wenig Daten"
                subtext={`Mindestens 2 Einträge für ${weightPeriodLabel} nötig.`}
              />
            )}
          </div>

          {/* Weight history */}
          {visibleProgressLogs.length > 0 && (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <h3 className="font-semibold text-[#EDECEA] text-[13px]">Gewichtsverlauf</h3>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {visibleProgressLogs.map((log, i) => {
                  const prev = visibleProgressLogs[i + 1]
                  const diff = log.body_weight && prev?.body_weight ? log.body_weight - prev.body_weight : null
                  return (
                    <li key={log.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1">
                        <div className="font-medium text-[#EDECEA] text-[13px]">
                          {log.body_weight ? `${log.body_weight} kg` : '–'}
                        </div>
                        <div className="text-[11px] text-[#797D83]">
                          {new Date(log.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                        </div>
                        {log.notes && <div className="text-[11px] text-[#797D83]/70 italic mt-0.5">{log.notes}</div>}
                      </div>
                      {diff !== null && (
                        <span className={`text-[13px] font-semibold ${diff < 0 ? 'text-[#A78BFA]' : diff > 0 ? 'text-red-400' : 'text-[#797D83]'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {visibleProgressLogs.length === 0 && workoutLogs.length === 0 && (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
              <EmptyState
                icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>}
                title="Noch keine Daten"
                subtext="Starte dein erstes Training!"
                ctaLabel="Training starten"
                ctaOnClick={() => router.push('/client/plan')}
              />
            </div>
          )}
        </div>
      )}

      {/* ── ÜBUNGEN ── */}
      {tab === 'exercises' && (
        <div className="space-y-4">
          {exerciseProgress.length === 0 || !selectedExercise ? (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
              <EmptyState
                icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>}
                title="Noch keine Übungsdaten"
                subtext="Trage beim Training Gewicht oder Wiederholungen ein, um deine Steigerung zu sehen."
                ctaLabel="Training starten"
                ctaOnClick={() => router.push('/client/plan')}
              />
            </div>
          ) : (
            <>
              <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-4">
                <div className="flex items-start gap-3 mb-3.5">
                  <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center text-[#A78BFA] flex-shrink-0">
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[14px] font-semibold text-[#EDECEA]">Übungsfortschritt</h2>
                    <p className="text-[11px] text-[#797D83] mt-0.5">
                      Entwicklung aus deinen letzten {Math.min(totalWorkouts, 100)} {Math.min(totalWorkouts, 100) === 1 ? 'Training' : 'Trainings'}
                    </p>
                  </div>
                </div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#797D83] mb-1.5" htmlFor="exercise-progress-select">
                  Übung auswählen
                </label>
                <div className="relative">
                  <select
                    id="exercise-progress-select"
                    value={selectedExercise.name}
                    onChange={event => setSelectedExerciseName(event.target.value)}
                    className="w-full appearance-none bg-white/[0.045] border border-white/[0.08] rounded-xl px-3.5 py-3 pr-10 text-[13px] font-medium text-[#EDECEA] outline-none focus:border-[#A78BFA]/50 focus:ring-2 focus:ring-[#A78BFA]/10 transition"
                  >
                    {exerciseProgress.map(series => (
                      <option key={series.name} value={series.name} className="bg-[#181818]">
                        {series.name}
                      </option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#797D83]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="p-5 pb-4 border-b border-white/[0.05]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A78BFA] mb-1">
                        {selectedExercise.metric === 'weight' ? 'Max. Gewicht pro Training' : 'Max. Wiederholungen'}
                      </p>
                      <h2 className="text-[19px] leading-tight font-bold text-[#EDECEA] truncate">{selectedExercise.name}</h2>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold tabular-nums ${
                      selectedExercise.change > 0
                        ? 'bg-[#A78BFA]/10 text-[#A78BFA]'
                        : selectedExercise.change < 0
                          ? 'bg-amber-400/10 text-amber-400'
                          : 'bg-white/[0.05] text-[#797D83]'
                    }`}>
                      {selectedExercise.change > 0 ? '+' : ''}{formatExerciseValue(selectedExercise.change, selectedExercise.metric)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#797D83] mt-2">
                    {selectedExercise.changePercent !== null
                      ? `${selectedExercise.changePercent > 0 ? '+' : ''}${selectedExercise.changePercent.toFixed(1)} % seit dem ersten Eintrag`
                      : 'Seit dem ersten Eintrag'}
                  </p>
                </div>

                <div className="grid grid-cols-3 divide-x divide-white/[0.05] border-b border-white/[0.05]">
                  <div className="px-3 py-3.5 text-center">
                    <div className="text-[15px] font-bold text-[#EDECEA] tabular-nums">
                      {formatExerciseValue(selectedExercise.current, selectedExercise.metric)}
                    </div>
                    <div className="text-[10px] text-[#797D83] mt-0.5">Aktuell</div>
                  </div>
                  <div className="px-3 py-3.5 text-center">
                    <div className="text-[15px] font-bold text-[#A78BFA] tabular-nums">
                      {formatExerciseValue(selectedExercise.best, selectedExercise.metric)}
                    </div>
                    <div className="text-[10px] text-[#797D83] mt-0.5">Bestwert</div>
                  </div>
                  <div className="px-3 py-3.5 text-center">
                    <div className="text-[15px] font-bold text-[#EDECEA] tabular-nums">{selectedExercise.points.length}</div>
                    <div className="text-[10px] text-[#797D83] mt-0.5">Einheiten</div>
                  </div>
                </div>

                <div className="px-3 pt-4 pb-2">
                  <ExerciseProgressChart series={selectedExercise} />
                  {selectedExercise.points.length > 12 && (
                    <p className="text-[10px] text-[#797D83] text-center -mt-1 mb-2">Letzte 12 Einheiten im Diagramm</p>
                  )}
                </div>
              </div>

              <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
                  <h3 className="font-semibold text-[#EDECEA] text-[13px]">Letzte Einheiten</h3>
                  <span className="text-[10px] text-[#797D83]">{selectedExercise.points.length} gesamt</span>
                </div>
                <ul className="divide-y divide-white/[0.04]">
                  {[...selectedExercise.points].reverse().slice(0, 6).map((point, index) => {
                    const previousPoint = selectedExercise.points[selectedExercise.points.length - 2 - index]
                    const difference = previousPoint ? point.value - previousPoint.value : null
                    return (
                      <li key={point.workoutId} className="flex items-center gap-3 px-5 py-3.5">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[12px] leading-none font-bold text-[#EDECEA]">{new Date(point.date).getDate()}</span>
                          <span className="text-[8px] leading-none uppercase text-[#797D83] mt-0.5">
                            {new Date(point.date).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-[#EDECEA] truncate">
                            {formatExerciseValue(point.value, selectedExercise.metric)}
                            {selectedExercise.metric === 'weight' && point.reps !== null && (
                              <span className="font-normal text-[#797D83]"> · {point.reps} Wdh.</span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#797D83] truncate mt-0.5">{point.workoutName ?? 'Training'}</div>
                        </div>
                        {difference !== null && difference !== 0 ? (
                          <span className={`text-[11px] font-semibold tabular-nums ${difference > 0 ? 'text-[#A78BFA]' : 'text-amber-400'}`}>
                            {difference > 0 ? '+' : ''}{formatExerciseValue(difference, selectedExercise.metric)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#797D83]/60">–</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CHECK-IN ── */}
      {tab === 'cycle' && clientGender === 'FEMALE' && <PeriodTracker />}

      {tab === 'checkin' && (
        <div className="space-y-4">

          {checkinSuccess && (
            <div className="flex items-center gap-3 bg-[#A78BFA]/[0.08] border border-[#A78BFA]/20 rounded-2xl px-4 py-3">
              <span className="text-[#A78BFA] font-bold text-lg">✓</span>
              <p className="text-[13px] font-medium text-[#A78BFA]">Check-in erfolgreich gespeichert!</p>
            </div>
          )}

          {checkinError && !showCheckinForm && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
              <span className="text-red-400 text-base mt-0.5">⚠</span>
              <div className="flex-1">
                <p className="text-[13px] text-red-400">{checkinError}</p>
                <button onClick={() => setCheckinError(null)} className="text-[11px] text-red-400/70 underline mt-1">Schließen</button>
              </div>
            </div>
          )}

          {alreadyCheckedIn && !showCheckinForm ? (
            <div className="bg-[#A78BFA]/[0.07] border border-[#A78BFA]/15 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span className="text-[#A78BFA] text-xl font-bold">✓</span>
                <div className="flex-1">
                  <div className="font-semibold text-[#EDECEA] text-[13px]">Check-in für diese Woche erledigt</div>
                  <p className="text-[11px] text-[#A78BFA]/70 mt-0.5">Woche ab {new Date(thisWeekStart).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</p>
                  <p className="text-[11px] text-[#EDECEA]/60 mt-1">Du kannst diesen Check-in bei Bedarf bearbeiten.</p>
                  <button onClick={openEditCheckin} className="text-[11px] text-[#A78BFA] underline mt-2 hover:text-[#B79FFB]">
                    Bearbeiten
                  </button>
                </div>
              </div>
            </div>
          ) : !showCheckinForm ? (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5">
              <h3 className="font-semibold text-[#EDECEA] mb-1">Wöchentlicher Check-in</h3>
              <p className="text-[13px] text-[#797D83] mb-4 leading-relaxed">Berichte deinem Trainer 1x pro Woche, wie deine Woche war – Stimmung, Energie, Schlaf und mehr.</p>
              <button
                onClick={() => { setCheckinError(null); setCheckinSuccess(false); setShowCheckinForm(true) }}
                className="press w-full py-3 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[13px] font-bold rounded-xl transition-colors shadow-[0_4px_16px_-4px_rgba(167,139,250,0.4)]"
              >
                Check-in ausfüllen
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveCheckin} className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5 space-y-5">
              <h3 className="font-semibold text-[#EDECEA]">
                Wöchentlicher Check-in
                <span className="ml-2 text-[11px] font-normal text-[#797D83]">
                  Woche ab {new Date(thisWeekStart).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </span>
              </h3>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-2 uppercase tracking-[0.1em]">Stimmung</label>
                <RatingButtons value={ciMood} onChange={setCiMood} emojis={['😫', '😕', '😐', '🙂', '😄']} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-2 uppercase tracking-[0.1em]">Energie</label>
                <RatingButtons value={ciEnergy} onChange={setCiEnergy} emojis={['🪫', '😴', '⚡', '🔥', '💥']} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-2 uppercase tracking-[0.1em]">Schlafqualität</label>
                <RatingButtons value={ciSleep} onChange={setCiSleep} emojis={['😱', '😔', '😐', '😊', '😴']} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-2 uppercase tracking-[0.1em]">Hunger / Ernährung</label>
                <RatingButtons value={ciHunger} onChange={setCiHunger} emojis={['🤢', '😞', '😐', '😋', '🥗']} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-2 uppercase tracking-[0.1em]">Stress</label>
                <RatingButtons value={ciStress} onChange={setCiStress} emojis={['😤', '😰', '😶', '😌', '🧘']} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-1.5 uppercase tracking-[0.1em]">Gewicht (kg, optional)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={ciWeight}
                  onChange={e => setCiWeight(e.target.value)}
                  placeholder="z. B. 78.4"
                  className="w-full px-4 py-2.5 border border-white/[0.1] bg-white/[0.05] rounded-xl text-[13px] text-[#EDECEA] placeholder-[#797D83]/60 focus:border-[#A78BFA]/40 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-1.5 uppercase tracking-[0.1em]">Kommentar</label>
                <textarea
                  value={ciComment}
                  onChange={e => setCiComment(e.target.value)}
                  placeholder="Wie war deine Woche? Was lief gut, was nicht?"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-white/[0.1] bg-white/[0.05] rounded-xl text-[13px] text-[#EDECEA] placeholder-[#797D83]/60 focus:border-[#A78BFA]/40 focus:outline-none transition resize-none"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-[11px] font-semibold text-[#797D83] mb-1.5 uppercase tracking-[0.1em]">Fotos (optional, max. 5)</label>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-[#A78BFA]/40 bg-[#A78BFA]/[0.05]'
                      : 'border-white/[0.1] hover:border-[#A78BFA]/25 bg-white/[0.02]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    className="hidden"
                    onChange={e => handleFiles(e.target.files)}
                  />
                  <p className="text-[13px] text-[#797D83]">📷 Tippen oder ablegen</p>
                  <p className="text-[11px] text-[#797D83]/50 mt-0.5">JPEG, PNG, WebP, HEIC · max. 10 MB</p>
                </div>
                {ciPreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {ciPreviews.map((preview, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-white/[0.1]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeNewFile(idx)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadProgress && <p className="text-[11px] text-[#797D83] mt-1">{uploadProgress}</p>}
              </div>

              {checkinError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <span className="text-red-400 text-sm mt-0.5">⚠</span>
                  <p className="text-[13px] text-red-400 flex-1">{checkinError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCheckinForm(false); setCheckinError(null) }}
                  className="press flex-1 py-2.5 border border-white/[0.08] text-[#797D83] text-[13px] font-medium rounded-xl hover:bg-white/[0.04]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={savingCheckin}
                  className="press flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[13px] font-bold rounded-xl transition-colors disabled:opacity-50 shadow-[0_4px_12px_-4px_rgba(167,139,250,0.4)]"
                >
                  {savingCheckin ? 'Speichern…' : thisWeekCheckin ? 'Aktualisieren' : 'Check-in senden'}
                </button>
              </div>
            </form>
          )}

          {/* History */}
          {checkins.length > 0 && (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <h3 className="font-semibold text-[#EDECEA] text-[13px]">Verlauf</h3>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {checkins.map(ci => (
                  <li key={ci.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[13px] font-semibold text-[#EDECEA]">
                        Woche ab {new Date(ci.week_start).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {ci.body_weight && (
                        <span className="text-[13px] font-bold text-[#A78BFA]">{ci.body_weight} kg</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      <RatingBadge value={ci.mood} label="Stimmung" />
                      <RatingBadge value={ci.energy} label="Energie" />
                      <RatingBadge value={ci.sleep_quality} label="Schlaf" />
                      <RatingBadge value={ci.hunger} label="Hunger" />
                      <RatingBadge value={ci.stress} label="Stress" />
                    </div>
                    {ci.comment && (
                      <p className="text-[11px] text-[#797D83] italic border-l-2 border-white/[0.1] pl-3 mt-2">{ci.comment}</p>
                    )}
                    {(ci.checkin_images?.length ?? 0) > 0 && (
                      <div className="grid grid-cols-4 gap-1.5 mt-3">
                        {ci.checkin_images!.map((img, imgIdx) => {
                          const url = resolveCheckinImageUrl(img.storage_path)
                          return url ? (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => openLightbox(ci.checkin_images!, imgIdx)}
                              className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-white/[0.08] hover:ring-[#A78BFA]/40 hover:scale-105 transition-all"
                            >
                              <Image src={url} alt="" fill className="object-cover" />
                            </button>
                          ) : (
                            <div key={img.id} className="aspect-square rounded-xl bg-white/[0.04]" />
                          )
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {checkins.length === 0 && !showCheckinForm && (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
              <EmptyState
                icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                title="Noch keine Check-ins"
                subtext="Fülle deinen ersten wöchentlichen Check-in aus."
              />
            </div>
          )}
        </div>
      )}

      {/* ── REKORDE ── */}
      {tab === 'records' && (
        <div className="space-y-4">
          {prs.length === 0 ? (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
              <EmptyState
                icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                title="Noch keine Rekorde"
                subtext="Starte ein Training um deinen ersten Rekord zu setzen."
                ctaLabel="Training starten"
                ctaOnClick={() => router.push('/client/plan')}
              />
            </div>
          ) : (
            <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <h3 className="font-semibold text-[#EDECEA] text-[13px]">Persönliche Rekorde</h3>
                <p className="text-[11px] text-[#797D83] mt-0.5">Höchstes Gewicht pro Übung aus den letzten 60 Einheiten</p>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {prs.map(pr => (
                  <li key={pr.name} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#A78BFA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#EDECEA] truncate">{pr.name}</div>
                      <div className="text-[11px] text-[#797D83]">
                        {new Date(pr.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-bold text-[#EDECEA]">{pr.weight} kg</div>
                      <div className="text-[11px] text-[#797D83]">{pr.reps} Wdh.</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
