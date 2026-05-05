'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CheckinImage, ProgressLog, WeeklyCheckin } from '@/lib/types'
import Lightbox from '@/components/Lightbox'
import { AnimatedNumber, Collapsible, StaggerItem, useToast } from '@/components/Motion'

// ─── Local types ────────────────────────────────────────────────────────────

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
  duration_seconds: number | null
  workout_day: { name: string } | null
  exercise_logs: ExerciseLogItem[]
}

type PersonalRecord = {
  name: string
  weight: number
  reps: string
  date: string
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

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

function calcWeeklyVolume(logs: WorkoutLogItem[]): { label: string; volume: number }[] {
  const monday = new Date(getMonday(new Date()))
  const buckets = Array.from({ length: 8 }, (_, i) => {
    const wMon = new Date(monday)
    wMon.setDate(monday.getDate() - (7 - i) * 7)
    const wSun = new Date(wMon)
    wSun.setDate(wMon.getDate() + 6)
    return {
      label: `${wMon.getDate().toString().padStart(2, '0')}.${(wMon.getMonth() + 1).toString().padStart(2, '0')}`,
      mondayStr: wMon.toISOString().split('T')[0],
      sundayStr: wSun.toISOString().split('T')[0],
      volume: 0,
    }
  })
  for (const log of logs) {
    for (const bucket of buckets) {
      if (log.date >= bucket.mondayStr && log.date <= bucket.sundayStr) {
        for (const el of log.exercise_logs) {
          if (el.completed && el.actual_weight && el.sets_done) {
            const reps = parseInt(el.actual_reps ?? '0') || 0
            bucket.volume += el.actual_weight * reps * el.sets_done
          }
        }
        break
      }
    }
  }
  return buckets.map(({ label, volume }) => ({ label, volume }))
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}t`
  return `${Math.round(v)}`
}

function formatDuration(s: number | null | undefined): string {
  if (!s) return ''
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`
}

// ─── Chart components ────────────────────────────────────────────────────────

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
      <path d={areaPath} fill="#10b981" fillOpacity="0.1" />
      <line x1={P.l} y1={py(min)} x2={W - P.r} y2={py(min)} stroke="#f3f4f6" strokeWidth="1" />
      <line x1={P.l} y1={py(max)} x2={W - P.r} y2={py(max)} stroke="#f3f4f6" strokeWidth="1" />
      <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.value)} r="3" fill="white" stroke="#10b981" strokeWidth="2" />
      ))}
      <text x={P.l - 4} y={py(max) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{max.toFixed(1)}</text>
      <text x={P.l - 4} y={py(min) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{min.toFixed(1)}</text>
      <text x={px(0)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(data[0].label)}</text>
      <text x={px(data.length - 1)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmt(data[data.length - 1].label)}</text>
    </svg>
  )
}

function BarChart({ data, color, formatValue }: {
  data: { label: string; value: number }[]
  color: string
  formatValue: (v: number) => string
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 64 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-px min-w-0">
            {d.value > 0 && <span className="text-[9px] text-gray-400 truncate">{formatValue(d.value)}</span>}
            <div
              className="w-full rounded-t-sm"
              style={{ height: d.value > 0 ? `${Math.max(3, Math.round((d.value / max) * 52))}px` : 0, backgroundColor: color }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1 border-t border-gray-100 pt-1.5">
        {data.map((d, i) => (
          <p key={i} className="flex-1 text-center text-[9px] text-gray-400 truncate">{d.label}</p>
        ))}
      </div>
    </div>
  )
}

// ─── Check-in subcomponents ──────────────────────────────────────────────────

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
            value === i + 1 ? 'bg-emerald-100 ring-2 ring-emerald-500' : 'bg-gray-50 hover:bg-gray-100'
          }`}
        >
          <span>{emoji}</span>
          <span className="text-[10px] text-gray-500">{i + 1}</span>
        </button>
      ))}
    </div>
  )
}

function RatingBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (!value) return null
  const color = value >= 4 ? 'text-green-700 bg-green-50' : value >= 3 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${color}`}>{value}/5</span>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'checkin' | 'records'

export default function ProgressPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([])
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLogItem[]>([])
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [tab, setTab] = useState<Tab>('overview')

  // Weight entry form
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [weightNotes, setWeightNotes] = useState('')
  const [savingWeight, setSavingWeight] = useState(false)

  // Check-in form
  const [showCheckinForm, setShowCheckinForm] = useState(false)
  const [ciWeight, setCiWeight] = useState('')
  const [ciMood, setCiMood] = useState(0)
  const [ciEnergy, setCiEnergy] = useState(0)
  const [ciSleep, setCiSleep] = useState(0)
  const [ciHunger, setCiHunger] = useState(0)
  const [ciStress, setCiStress] = useState(0)
  const [ciComment, setCiComment] = useState('')
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [checkinError, setCheckinError] = useState<string | null>(null)
  const [checkinSuccess, setCheckinSuccess] = useState(false)

  // Image upload (new files, not yet uploaded)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ciFiles, setCiFiles] = useState<File[]>([])
  const [ciPreviews, setCiPreviews] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Signed URL cache: storage_path → signed URL
  const [signedUrlMap, setSignedUrlMap] = useState<Record<string, string>>({})

  // Lightbox
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([])
  const [lightboxIdx, setLightboxIdx] = useState(0)

  const load = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: client } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
    if (!client) { setLoading(false); return }
    setClientId(client.id)

    const [progressRes, workoutsRes, totalRes, checkinsRes] = await Promise.all([
      supabase.from('progress_logs').select('*').eq('client_id', client.id).order('date', { ascending: false }).limit(30),
      supabase
        .from('workout_logs')
        .select('id, date, duration_seconds, workout_day:workout_days(name), exercise_logs(actual_weight, actual_reps, sets_done, completed, exercise:exercises(name))')
        .eq('client_id', client.id)
        .not('completed_at', 'is', null)
        .order('date', { ascending: false })
        .limit(60),
      supabase.from('workout_logs').select('id', { count: 'exact', head: true }).eq('client_id', client.id).not('completed_at', 'is', null),
      supabase
        .from('weekly_checkins')
        .select('*, checkin_images(id, storage_path, created_at)')
        .eq('client_id', client.id)
        .order('week_start', { ascending: false }),
    ])

    setProgressLogs(progressRes.data ?? [])
    setWorkoutLogs((workoutsRes.data ?? []) as unknown as WorkoutLogItem[])
    setTotalWorkouts(totalRes.count ?? 0)

    const checkinsData = (checkinsRes.data ?? []) as WeeklyCheckin[]
    setCheckins(checkinsData)

    // Generate signed URLs for all images in one batch call
    const allPaths = checkinsData.flatMap(c =>
      (c.checkin_images ?? []).map((img: CheckinImage) => img.storage_path)
    )
    if (allPaths.length > 0) {
      const { data: signedData } = await supabase.storage
        .from('checkin-images')
        .createSignedUrls(allPaths, 3600)
      const map: Record<string, string> = {}
      signedData?.forEach(item => {
        if (item.signedUrl && item.path) map[item.path] = item.signedUrl
      })
      setSignedUrlMap(map)
    }

    setLoading(false)
    } catch (err) {
      console.error('[Progress] load failed:', err)
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Derived data ────────────────────────────────────────────────────────

  const streak = useMemo(() => calcStreak(workoutLogs.map(l => l.date)), [workoutLogs])
  const prs = useMemo(() => calcPRs(workoutLogs), [workoutLogs])
  const weeklyVolume = useMemo(() => calcWeeklyVolume(workoutLogs), [workoutLogs])
  const chartData = useMemo(
    () => [...progressLogs].reverse().map(l => ({ label: l.date, value: l.body_weight ?? 0 })).filter(d => d.value > 0),
    [progressLogs]
  )

  const thisWeekStart = getMonday(new Date())
  const alreadyCheckedIn = checkins.some(c => c.week_start === thisWeekStart)
  const thisWeekCheckin = checkins.find(c => c.week_start === thisWeekStart)

  const latestWeight = progressLogs[0]?.body_weight
  const firstWeight = progressLogs[progressLogs.length - 1]?.body_weight
  const weightChange = latestWeight && firstWeight ? latestWeight - firstWeight : null

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientId || !weightInput) return
    setSavingWeight(true)
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('progress_logs').upsert(
      { client_id: clientId, date: today, body_weight: parseFloat(weightInput), notes: weightNotes || null },
      { onConflict: 'client_id,date' }
    )
    if (!error) showToast('Gewicht gespeichert ✓', 'success')
    setWeightInput('')
    setWeightNotes('')
    setShowWeightForm(false)
    setSavingWeight(false)
    await load()
  }

  const openEditCheckin = () => {
    if (thisWeekCheckin) {
      setCiWeight(thisWeekCheckin.body_weight?.toString() ?? '')
      setCiMood(thisWeekCheckin.mood ?? 0)
      setCiEnergy(thisWeekCheckin.energy ?? 0)
      setCiSleep(thisWeekCheckin.sleep_quality ?? 0)
      setCiHunger(thisWeekCheckin.hunger ?? 0)
      setCiStress(thisWeekCheckin.stress ?? 0)
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

    if (!clientId) {
      setCheckinError('Kein Kundenprofil gefunden – bitte Seite neu laden.')
      return
    }

    setSavingCheckin(true)

    try {
      // 1. Upsert check-in and retrieve its id
      const { data: savedCheckin, error: upsertError } = await supabase
        .from('weekly_checkins')
        .upsert(
          {
            client_id: clientId,
            week_start: thisWeekStart,
            body_weight: ciWeight ? parseFloat(ciWeight) : null,
            mood: ciMood || null,
            energy: ciEnergy || null,
            sleep_quality: ciSleep || null,
            hunger: ciHunger || null,
            stress: ciStress || null,
            comment: ciComment || null,
          },
          { onConflict: 'client_id,week_start' }
        )
        .select('id')
        .single()

      if (upsertError) {
        console.error('[Check-in] upsert error:', upsertError)
        setCheckinError(
          `Speichern fehlgeschlagen: ${upsertError.message}` +
          (upsertError.code === '42P01' ? ' (Tabelle fehlt – Migration ausführen!)' : '')
        )
        return
      }

      if (!savedCheckin?.id) {
        setCheckinError('Check-in wurde nicht gespeichert. Bitte erneut versuchen.')
        return
      }

      // 2. Upload new images
      const uploadErrors: string[] = []
      if (ciFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          for (let i = 0; i < ciFiles.length; i++) {
            const file = ciFiles[i]
            setUploadProgress(`Bild ${i + 1} von ${ciFiles.length} wird hochgeladen…`)
            const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
            const path = `${user.id}/${savedCheckin.id}/${crypto.randomUUID()}.${ext}`

            const { error: uploadError } = await supabase.storage
              .from('checkin-images')
              .upload(path, file, { contentType: file.type, upsert: false })

            if (!uploadError) {
              await supabase
                .from('checkin_images')
                .insert({ checkin_id: savedCheckin.id, storage_path: path })
            } else {
              console.error(`[Upload] Bild ${i + 1}:`, uploadError)
              uploadErrors.push(uploadError.message)
            }
          }
        }
      }

      // 3. Reset form
      setCiWeight(''); setCiMood(0); setCiEnergy(0); setCiSleep(0)
      setCiHunger(0); setCiStress(0); setCiComment('')
      ciPreviews.forEach(p => URL.revokeObjectURL(p))
      setCiFiles([])
      setCiPreviews([])
      setUploadProgress('')
      setShowCheckinForm(false)

      if (uploadErrors.length > 0) {
        // Show the EXACT Supabase error so we can diagnose it
        const unique = [...new Set(uploadErrors)]
        setCheckinError(
          `Check-in gespeichert ✓, aber ${uploadErrors.length} Bild(er) fehlgeschlagen.\n` +
          `Fehler: ${unique.join(' | ')}`
        )
      } else {
      setCheckinSuccess(true)
      showToast('Check-in gespeichert ✓', 'success')
        setTimeout(() => setCheckinSuccess(false), 4000)
      }

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
    const urls = images.map(img => signedUrlMap[img.storage_path]).filter(Boolean)
    if (!urls.length) return
    setLightboxUrls(urls)
    setLightboxIdx(startIndex)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!clientId) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-gray-500 text-sm">Dein Konto ist noch nicht mit einem Trainer verknüpft.</p>
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'checkin', label: 'Check-in' },
    { key: 'records', label: 'Rekorde' },
  ]

  return (
    <div className="p-4 max-w-lg mx-auto">
      {lightboxUrls.length > 0 && (
        <Lightbox
          urls={lightboxUrls}
          startIndex={lightboxIdx}
          onClose={() => setLightboxUrls([])}
        />
      )}

      <h1 className="text-xl font-bold text-gray-900 mb-4">Fortschritt</h1>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
              <div className="text-xl font-bold text-gray-900">{latestWeight ? <AnimatedNumber value={latestWeight} decimals={1} /> : '-'}</div>
              <div className="text-xs text-gray-500 mt-0.5">kg aktuell</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
              <div className="text-xl font-bold text-gray-900"><AnimatedNumber value={totalWorkouts} /></div>
              <div className="text-xs text-gray-500 mt-0.5">Trainings</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
              <div className={`text-xl font-bold ${streak > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                {streak > 0 ? <AnimatedNumber value={streak} /> : '-'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{streak > 0 ? '🔥 Wochen' : 'Streak'}</div>
            </div>
          </div>

          {/* Weight chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Gewichtsverlauf</h3>
                {weightChange !== null && (
                  <p className={`text-xs mt-0.5 font-medium ${weightChange < 0 ? 'text-emerald-600' : weightChange > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    Gesamt: {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowWeightForm(v => !v)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                + Eintragen
              </button>
            </div>

            {/* Inline weight entry form */}
            <Collapsible open={showWeightForm}>
              <form onSubmit={handleSaveWeight} className="mb-4 p-4 bg-gray-50 rounded-xl space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gewicht (kg) *</label>
                    <input
                      required autoFocus
                      type="number" step="0.1"
                      value={weightInput}
                      onChange={e => setWeightInput(e.target.value)}
                      placeholder="80.5"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notiz</label>
                    <input
                      value={weightNotes}
                      onChange={e => setWeightNotes(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowWeightForm(false)} className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-100">Abbrechen</button>
                  <button type="submit" disabled={savingWeight} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg disabled:opacity-60">
                    {savingWeight ? 'Speichern…' : 'Speichern'}
                  </button>
                </div>
              </form>
            </Collapsible>

            {chartData.length >= 2 ? (
              <SvgLineChart data={chartData} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">Mindestens 2 Einträge für den Verlauf nötig.</p>
            )}
          </div>

          {/* Volume bar chart */}
          {weeklyVolume.some(w => w.volume > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm">Trainingsvolumen</h3>
              <p className="text-xs text-gray-400 mt-0.5 mb-4">Kg bewegt pro Woche (Gewicht × Wdh. × Sätze)</p>
              <BarChart
                data={weeklyVolume.map(w => ({ label: w.label, value: w.volume }))}
                color="#6366f1"
                formatValue={formatVolume}
              />
            </div>
          )}

          {/* Recent workouts */}
          {workoutLogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm">Letzte Trainings</h3>
              </div>
              <ul className="divide-y divide-gray-100">
                {workoutLogs.slice(0, 5).map((log, index) => (
                  <li key={log.id}>
                    <StaggerItem index={index} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {(log.workout_day as { name: string } | null)?.name ?? 'Training'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(log.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    {log.duration_seconds ? (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg tabular-nums">
                        {formatDuration(log.duration_seconds)}
                      </span>
                    ) : null}
                    </StaggerItem>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weight history */}
          {progressLogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm">Gewichtsverlauf</h3>
              </div>
              <ul className="divide-y divide-gray-100">
                {progressLogs.map((log, i) => {
                  const prev = progressLogs[i + 1]
                  const diff = log.body_weight && prev?.body_weight ? log.body_weight - prev.body_weight : null
                  return (
                    <li key={log.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 text-sm">
                          {log.body_weight ? `${log.body_weight} kg` : '–'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(log.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                        </div>
                        {log.notes && <div className="text-xs text-gray-400 italic mt-0.5">{log.notes}</div>}
                      </div>
                      {diff !== null && (
                        <span className={`text-sm font-semibold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {progressLogs.length === 0 && workoutLogs.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
              <div className="text-4xl mb-3">📈</div>
              <p className="text-gray-500 text-sm">Noch keine Daten. Starte dein erstes Training!</p>
            </div>
          )}
        </div>
      )}

      {/* ── CHECK-IN ── */}
      {tab === 'checkin' && (
        <div className="space-y-4">

          {/* Success banner */}
          {checkinSuccess && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
              <span className="text-xl">✅</span>
              <p className="text-sm font-medium text-emerald-700">Check-in erfolgreich gespeichert!</p>
            </div>
          )}

          {/* Error banner (outside form, for errors that persist after close) */}
          {checkinError && !showCheckinForm && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <span className="text-base mt-0.5">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700">{checkinError}</p>
                <button onClick={() => setCheckinError(null)} className="text-xs text-red-500 underline mt-1">Schließen</button>
              </div>
            </div>
          )}

          {/* This week status */}
          {alreadyCheckedIn && !showCheckinForm ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div className="flex-1">
                  <div className="font-semibold text-emerald-800 text-sm">Check-in diese Woche erledigt</div>
                  <p className="text-xs text-emerald-600 mt-0.5">Woche ab {new Date(thisWeekStart).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</p>
                  <button onClick={openEditCheckin} className="text-xs text-emerald-700 underline mt-2 hover:text-emerald-900">
                    Bearbeiten
                  </button>
                </div>
              </div>
            </div>
          ) : !showCheckinForm ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-1">Wöchentlicher Check-in</h3>
              <p className="text-sm text-gray-500 mb-4">Berichte deinem Trainer, wie die Woche war – Stimmung, Energie, Schlaf und mehr.</p>
              <button
                onClick={() => { setCheckinError(null); setCheckinSuccess(false); setShowCheckinForm(true) }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Check-in ausfüllen
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveCheckin} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-5">
              <h3 className="font-semibold text-gray-900">
                Wöchentlicher Check-in
                <span className="ml-2 text-xs font-normal text-gray-400">
                  Woche ab {new Date(thisWeekStart).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                </span>
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Körpergewicht (optional)</label>
                <input
                  type="number" step="0.1"
                  value={ciWeight}
                  onChange={e => setCiWeight(e.target.value)}
                  placeholder="z.B. 80.5 kg"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stimmung</label>
                <RatingButtons value={ciMood} onChange={setCiMood} emojis={['😫', '😕', '😐', '🙂', '😄']} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Energie</label>
                <RatingButtons value={ciEnergy} onChange={setCiEnergy} emojis={['🪫', '😴', '⚡', '🔥', '💥']} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Schlafqualität</label>
                <RatingButtons value={ciSleep} onChange={setCiSleep} emojis={['😱', '😔', '😐', '😊', '😴']} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hunger / Ernährung</label>
                <RatingButtons value={ciHunger} onChange={setCiHunger} emojis={['🤢', '😞', '😐', '😋', '🥗']} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stress</label>
                <RatingButtons value={ciStress} onChange={setCiStress} emojis={['😤', '😰', '😶', '😌', '🧘']} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Kommentar</label>
                <textarea
                  value={ciComment}
                  onChange={e => setCiComment(e.target.value)}
                  placeholder="Wie war deine Woche? Was lief gut, was nicht?"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              {/* ── Image Upload ── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Progress-Fotos
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    (optional · bis zu 5 · max. 10 MB je Bild)
                  </span>
                </label>

                {/* Existing images (already uploaded for this week) */}
                {(thisWeekCheckin?.checkin_images?.length ?? 0) > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-2">Bereits hochgeladen:</p>
                    <div className="grid grid-cols-4 gap-2">
                      {thisWeekCheckin!.checkin_images!.map((img, i) => {
                        const url = signedUrlMap[img.storage_path]
                        return url ? (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => openLightbox(thisWeekCheckin!.checkin_images!, i)}
                            className="aspect-square rounded-xl overflow-hidden ring-1 ring-gray-200 hover:ring-emerald-400 transition-all"
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div key={img.id} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleFiles(e.target.files)}
                />

                {/* New file previews */}
                {ciPreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {ciPreviews.map((url, i) => (
                      <div key={i} className="relative aspect-square">
                        <img
                          src={url}
                          alt=""
                          className="w-full h-full object-cover rounded-xl ring-1 ring-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeNewFile(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors leading-none"
                          aria-label="Entfernen"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {/* Add-more button */}
                    {(thisWeekCheckin?.checkin_images?.length ?? 0) + ciFiles.length < 5 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-colors text-xl"
                        aria-label="Weiteres Bild hinzufügen"
                      >
                        +
                      </button>
                    )}
                  </div>
                )}

                {/* Drop zone (only show when no previews yet and slots remain) */}
                {ciPreviews.length === 0 && (thisWeekCheckin?.checkin_images?.length ?? 0) < 5 && (
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors select-none ${
                      isDragging
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-2xl mb-1.5">📸</div>
                    <p className="text-sm font-medium text-gray-600">Fotos hinzufügen</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Tippen zum Auswählen · Drag &amp; Drop · Kamera oder Galerie
                    </p>
                  </div>
                )}

                {/* Upload progress indicator */}
                {uploadProgress && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                    <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    {uploadProgress}
                  </div>
                )}
              </div>

              {/* Inline error inside form */}
              {checkinError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <span className="text-sm mt-0.5">⚠️</span>
                  <p className="text-sm text-red-700 flex-1">{checkinError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCheckinForm(false); setCheckinError(null) }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={savingCheckin}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                >
                  {savingCheckin
                    ? (uploadProgress || 'Speichern…')
                    : 'Check-in senden'}
                </button>
              </div>
            </form>
          )}

          {/* History */}
          {checkins.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm">Verlauf</h3>
              </div>
              <ul className="divide-y divide-gray-100">
                {checkins.map(ci => (
                  <li key={ci.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-gray-900">
                        Woche ab {new Date(ci.week_start).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {ci.body_weight && (
                        <span className="text-sm font-bold text-emerald-600">{ci.body_weight} kg</span>
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
                      <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3 mt-2">{ci.comment}</p>
                    )}

                    {/* Images */}
                    {(ci.checkin_images?.length ?? 0) > 0 && (
                      <div className="grid grid-cols-4 gap-1.5 mt-3">
                        {ci.checkin_images!.map((img, imgIdx) => {
                          const url = signedUrlMap[img.storage_path]
                          return url ? (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => openLightbox(ci.checkin_images!, imgIdx)}
                              className="aspect-square rounded-xl overflow-hidden ring-1 ring-gray-200 hover:ring-emerald-400 hover:scale-105 transition-all"
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </button>
                          ) : (
                            <div key={img.id} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
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
            <div className="bg-white rounded-2xl border border-gray-100 py-10 text-center shadow-sm">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-gray-400 text-sm">Noch keine Check-ins vorhanden.</p>
            </div>
          )}
        </div>
      )}

      {/* ── REKORDE ── */}
      {tab === 'records' && (
        <div className="space-y-4">
          {prs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center shadow-sm">
              <div className="text-4xl mb-3">🏆</div>
              <p className="text-gray-500 text-sm">Noch keine Rekorde. Starte ein Training!</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm">Persönliche Rekorde</h3>
                <p className="text-xs text-gray-400 mt-0.5">Höchstes Gewicht pro Übung aus den letzten 60 Einheiten</p>
              </div>
              <ul className="divide-y divide-gray-100">
                {prs.map(pr => (
                  <li key={pr.name} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0 text-base">
                      🏆
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{pr.name}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(pr.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-gray-900">{pr.weight} kg</div>
                      <div className="text-xs text-gray-400">{pr.reps} Wdh.</div>
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
