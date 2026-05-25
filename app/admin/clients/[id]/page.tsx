'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { CheckinImage, Client, AssignedPlan, WorkoutPlan, WorkoutLog, ProgressLog, WeeklyCheckin } from '@/lib/types'
import Lightbox from '@/components/Lightbox'
import { useToast } from '@/components/Motion'

type Tab = 'overview' | 'plans' | 'history' | 'progress' | 'analyse' | 'checkins'

type ExerciseLogDetail = {
  id: string
  sets_done: number | null
  actual_weight: number | null
  actual_reps: string | null
  completed: boolean
  exercise: { name: string } | null
}

type WorkoutLogDetail = Omit<WorkoutLog, 'exercise_logs' | 'workout_day'> & {
  workout_day: { name: string } | null
  exercise_logs: ExerciseLogDetail[]
}

type NutritionAssignmentSummary = {
  id: string
  plan_id: string
  assigned_at: string
  is_active: boolean
  plan_name: string | null
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m >= 60) return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}min`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTotalDuration(seconds: number): string {
  if (seconds === 0) return '–'
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

function formatMinutes(min: number): string {
  if (min === 0) return '–'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const rem = min % 60
  return rem === 0 ? `${h}h` : `${h}h${rem}m`
}

type WeekBucket = { label: string; workouts: number; minutes: number }

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

function AdminRatingBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (!value) return null
  const color = value >= 4 ? 'text-green-700 bg-green-50' : value >= 3 ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${color}`}>{value}/5</span>
    </div>
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
      <div className="flex items-end gap-1 sm:gap-1.5" style={{ height: '80px' }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-px min-w-0">
            <span className="text-[10px] text-gray-500 leading-none">
              {d.value > 0 ? formatValue(d.value) : ''}
            </span>
            <div
              className="w-full rounded-t-sm"
              style={{
                height: `${d.value > 0 ? Math.max(Math.round((d.value / max) * 68), 3) : 0}px`,
                backgroundColor: color,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 sm:gap-1.5 mt-1.5 pt-1.5 border-t border-gray-100">
        {data.map((d, i) => (
          <p key={i} className="flex-1 text-center text-[10px] text-gray-400 truncate leading-tight">
            {d.label}
          </p>
        ))}
      </div>
    </div>
  )
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { showToast } = useToast()

  const [client, setClient] = useState<Client | null>(null)
  const [assignedPlans, setAssignedPlans] = useState<AssignedPlan[]>([])
  const [assignedNutritionPlans, setAssignedNutritionPlans] = useState<NutritionAssignmentSummary[]>([])
  const [availablePlans, setAvailablePlans] = useState<WorkoutPlan[]>([])
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([])
  const [historyLogs, setHistoryLogs] = useState<WorkoutLogDetail[]>([])
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([])
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([])
  const [adminSignedUrlMap, setAdminSignedUrlMap] = useState<Record<string, string>>({})
  const [adminLightboxUrls, setAdminLightboxUrls] = useState<string[]>([])
  const [adminLightboxIdx, setAdminLightboxIdx] = useState(0)
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set())
  const [weeklyStats, setWeeklyStats] = useState({ workouts: 0, seconds: 0, sets: 0 })
  const [lastWeekStats, setLastWeekStats] = useState({ workouts: 0, seconds: 0, sets: 0 })
  const [monthlyStats, setMonthlyStats] = useState({ workouts: 0, seconds: 0, sets: 0 })
  const [chartWeeks, setChartWeeks] = useState<WeekBucket[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  // Trainer notes editing
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const now = new Date()
      const dayOfWeek = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      monday.setHours(0, 0, 0, 0)
      const weekStart = monday.toISOString().split('T')[0]
      const lastWeekMonday = new Date(monday)
      lastWeekMonday.setDate(monday.getDate() - 7)
      const lastWeekStart = lastWeekMonday.toISOString().split('T')[0]
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const chartStart = new Date(monday)
      chartStart.setDate(monday.getDate() - 49)
      const chartStartStr = chartStart.toISOString().split('T')[0]

      const [clientRes, assignedRes, assignedNutritionRes, plansRes, logsRes, historyRes, progressRes, analyseRes, chartRes, checkinsRes, lastWeekRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('assigned_plans').select('*, plan:workout_plans(*)').eq('client_id', id).order('assigned_at', { ascending: false }),
        supabase
          .from('assigned_nutrition_plans')
          .select('id, client_id, plan_id, assigned_at, is_active, plan:nutrition_plans(id, name)')
          .eq('client_id', id)
          .order('assigned_at', { ascending: false }),
        supabase.from('workout_plans').select('*').eq('trainer_id', user.id).order('name'),
        supabase.from('workout_logs').select('id', { count: 'exact', head: true }).eq('client_id', id).not('completed_at', 'is', null),
        supabase.from('workout_logs')
          .select('*, workout_day:workout_days(name), exercise_logs(id, sets_done, actual_weight, actual_reps, completed, exercise:exercises(name))')
          .eq('client_id', id)
          .not('completed_at', 'is', null)
          .order('date', { ascending: false })
          .limit(10),
        supabase.from('progress_logs').select('*').eq('client_id', id).order('date', { ascending: false }).limit(20),
        supabase.from('workout_logs')
          .select('id, duration_seconds, date, exercise_logs(id, completed)')
          .eq('client_id', id)
          .not('completed_at', 'is', null)
          .gte('date', monthStart),
        supabase.from('workout_logs')
          .select('date, duration_seconds')
          .eq('client_id', id)
          .not('completed_at', 'is', null)
          .gte('date', chartStartStr),
        supabase.from('weekly_checkins').select('*, checkin_images(id, storage_path, created_at)').eq('client_id', id).order('week_start', { ascending: false }),
        supabase.from('workout_logs')
          .select('id, duration_seconds, exercise_logs(id, completed)')
          .eq('client_id', id)
          .not('completed_at', 'is', null)
          .gte('date', lastWeekStart)
          .lt('date', weekStart),
      ])

      if (!clientRes.data) { router.push('/admin/clients'); return }

      const mainError = clientRes.error ?? assignedRes.error ?? plansRes.error ?? logsRes.error ?? progressRes.error
      if (mainError) throw mainError
      if (historyRes.error) console.error('Failed to load workout history', historyRes.error)
      if (analyseRes.error) console.error('Failed to load workout analysis', analyseRes.error)
      if (chartRes.error) console.error('Failed to load chart data', chartRes.error)

      setClient(clientRes.data)
      setProfileName(clientRes.data.full_name ?? '')
      setProfilePhone(clientRes.data.phone ?? '')
      setNotesValue(clientRes.data.notes ?? '')
      setAssignedPlans((assignedRes.data ?? []) as AssignedPlan[])
      const nutritionAssignments: NutritionAssignmentSummary[] = ((assignedNutritionRes.data ?? []) as Array<{
        id: string
        plan_id: string
        assigned_at: string
        is_active: boolean
        plan: Array<{ name: string }> | { name: string } | null
      }>).map((row) => {
        const planName = Array.isArray(row.plan)
          ? (row.plan[0]?.name ?? null)
          : (row.plan?.name ?? null)
        return {
          id: row.id,
          plan_id: row.plan_id,
          assigned_at: row.assigned_at,
          is_active: row.is_active,
          plan_name: planName,
        }
      })
      setAssignedNutritionPlans(nutritionAssignments)
      setAvailablePlans(plansRes.data ?? [])
      setWorkoutLogs(Array.from({ length: logsRes.count ?? 0 }) as WorkoutLog[])
      setHistoryLogs((historyRes.data ?? []) as WorkoutLogDetail[])
      setProgressLogs(progressRes.data ?? [])
      const checkinsData = (checkinsRes.data ?? []) as WeeklyCheckin[]
      setCheckins(checkinsData)

      // Batch signed URLs for all check-in images
      const allImagePaths = checkinsData.flatMap(c =>
        (c.checkin_images ?? []).map((img: CheckinImage) => img.storage_path)
      )
      if (allImagePaths.length > 0) {
        const { data: signedData } = await supabase.storage
          .from('checkin-images')
          .createSignedUrls(allImagePaths, 3600)
        const map: Record<string, string> = {}
        signedData?.forEach(item => {
          if (item.signedUrl && item.path) map[item.path] = item.signedUrl
        })
        setAdminSignedUrlMap(map)
      }

      type AnalyseLog = { id: string; duration_seconds: number | null; date: string; exercise_logs: Array<{ id: string; completed: boolean }> }
      const analyseLogs = (analyseRes.data ?? []) as AnalyseLog[]
      const weekLogs = analyseLogs.filter(l => l.date >= weekStart)
      setWeeklyStats({
        workouts: weekLogs.length,
        seconds: weekLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0),
        sets: weekLogs.reduce((s, l) => s + l.exercise_logs.filter(e => e.completed).length, 0),
      })
      setMonthlyStats({
        workouts: analyseLogs.length,
        seconds: analyseLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0),
        sets: analyseLogs.reduce((s, l) => s + l.exercise_logs.filter(e => e.completed).length, 0),
      })

      type LastWeekLog = { id: string; duration_seconds: number | null; exercise_logs: Array<{ id: string; completed: boolean }> }
      const lwLogs = (lastWeekRes.data ?? []) as LastWeekLog[]
      setLastWeekStats({
        workouts: lwLogs.length,
        seconds: lwLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0),
        sets: lwLogs.reduce((s, l) => s + l.exercise_logs.filter(e => e.completed).length, 0),
      })

      // 8-week chart buckets
      type ChartLog = { date: string; duration_seconds: number | null }
      const rawChartLogs = (chartRes.data ?? []) as ChartLog[]
      const buckets = Array.from({ length: 8 }, (_, i) => {
        const wMon = new Date(monday)
        wMon.setDate(monday.getDate() - (7 - i) * 7)
        const wSun = new Date(wMon)
        wSun.setDate(wMon.getDate() + 6)
        return {
          label: `${wMon.getDate().toString().padStart(2, '0')}.${(wMon.getMonth() + 1).toString().padStart(2, '0')}`,
          mondayStr: wMon.toISOString().split('T')[0],
          sundayStr: wSun.toISOString().split('T')[0],
          workouts: 0,
          minutes: 0,
        }
      })
      for (const log of rawChartLogs) {
        for (const w of buckets) {
          if (log.date >= w.mondayStr && log.date <= w.sundayStr) {
            w.workouts++
            w.minutes += Math.round((log.duration_seconds ?? 0) / 60)
            break
          }
        }
      }
      setChartWeeks(buckets.map(({ label, workouts, minutes }) => ({ label, workouts, minutes })))
    } catch (error) {
      console.error('Failed to load client detail', error)
      setLoadError('Kundendaten konnten gerade nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const handleAssignPlan = async () => {
    if (!selectedPlanId) return
    setAssigning(true)
    const { error: deactivateError } = await supabase
      .from('assigned_plans')
      .update({ is_active: false })
      .eq('client_id', id)
      .eq('is_active', true)
    if (deactivateError) {
      showToast('Plan konnte nicht zugewiesen werden.', 'danger')
      setAssigning(false)
      return
    }

    const { error } = await supabase.from('assigned_plans').insert({ client_id: id, plan_id: selectedPlanId, is_active: true })
    if (error) {
      showToast('Plan konnte nicht zugewiesen werden.', 'danger')
      setAssigning(false)
      return
    }
    if (!error && client?.user_id) {
      const assignedPlan = availablePlans.find(plan => plan.id === selectedPlanId)
      await supabase.from('notifications').insert({
        client_id: client.user_id,
        type: 'workout_plan',
        title: 'Neuer Trainingsplan zugewiesen',
        body: assignedPlan?.name ?? null,
        is_read: false,
      })
    }
    showToast('Plan zugewiesen ✓', 'success')
    setSelectedPlanId('')
    await load()
    setAssigning(false)
  }

  const togglePlanActive = async (apId: string, current: boolean) => {
    await supabase.from('assigned_plans').update({ is_active: !current }).eq('id', apId)
    showToast(!current ? 'Plan aktiviert ✓' : 'Plan deaktiviert', 'success')
    await load()
  }

  const removePlan = async (apId: string) => {
    await supabase.from('assigned_plans').delete().eq('id', apId)
    showToast('Plan entfernt', 'danger')
    await load()
  }

  const toggleLog = (logId: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev)
      if (next.has(logId)) next.delete(logId); else next.add(logId)
      return next
    })
  }


  const resetProfileForm = () => {
    if (!client) return
    setProfileName(client.full_name ?? '')
    setProfilePhone(client.phone ?? '')
  }

  const handleSaveProfile = async () => {
    if (!client) return

    const fullName = profileName.trim()
    const email = client.email.trim().toLowerCase()
    const phone = profilePhone.trim()

    if (!fullName) {
      showToast('Name ist erforderlich.', 'danger')
      return
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailValid) {
      showToast('Bitte eine gültige E-Mail-Adresse angeben.', 'danger')
      return
    }

    setSavingProfile(true)
    try {
      const response = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          full_name: fullName,
          email,
          phone,
          notes: client.notes ?? '',
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        showToast(payload?.error ?? 'Kundendaten konnten nicht gespeichert werden.', 'danger')
        return
      }

      showToast('Kundendaten gespeichert ✓', 'success')
      setEditingProfile(false)
      await load()
    } catch {
      showToast('Netzwerkfehler beim Speichern.', 'danger')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveNotesViaAdminRoute = async () => {
    if (!client) return
    const fullName = profileName.trim() || client.full_name
    const email = client.email
    const phone = profilePhone.trim()

    setSavingNotes(true)
    try {
      const response = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          full_name: fullName,
          email,
          phone,
          notes: notesValue,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        showToast(payload?.error ?? 'Notiz konnte nicht gespeichert werden.', 'danger')
        return
      }

      showToast('Notiz gespeichert ✓', 'success')
      setEditingNotes(false)
      await load()
    } catch {
      showToast('Netzwerkfehler beim Speichern der Notiz.', 'danger')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleResetPassword = async () => {
    if (!client) return
    if (!client.user_id) {
      showToast('Dieser Kunde hat noch keinen App-Zugang.', 'danger')
      return
    }

    if (!newPassword || !confirmNewPassword) {
      showToast('Bitte Passwort und Bestätigung eingeben.', 'danger')
      return
    }
    if (newPassword.length < 6) {
      showToast('Passwort muss mindestens 6 Zeichen lang sein.', 'danger')
      return
    }
    if (newPassword !== confirmNewPassword) {
      showToast('Passwörter stimmen nicht überein.', 'danger')
      return
    }

    setResettingPassword(true)
    try {
      const response = await fetch('/api/admin/reset-client-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          password: newPassword,
          confirmPassword: confirmNewPassword,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        showToast(payload?.error ?? 'Passwort konnte nicht zurückgesetzt werden.', 'danger')
        return
      }

      showToast('Passwort erfolgreich zurückgesetzt ✓', 'success')
      setNewPassword('')
      setConfirmNewPassword('')
      setResetPasswordOpen(false)
    } catch {
      showToast('Netzwerkfehler beim Zurücksetzen des Passworts.', 'danger')
    } finally {
      setResettingPassword(false)
    }
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!client) {
    return loadError ? (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      </div>
    ) : null
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'plans', label: 'Pläne' },
    { key: 'history', label: 'Training' },
    { key: 'progress', label: 'Fortschritt' },
    { key: 'analyse', label: 'Analyse' },
    { key: 'checkins', label: 'Check-ins' },
  ]

  const openAdminLightbox = (images: CheckinImage[], startIndex: number) => {
    const urls = images.map(img => adminSignedUrlMap[img.storage_path]).filter(Boolean)
    if (!urls.length) return
    setAdminLightboxUrls(urls)
    setAdminLightboxIdx(startIndex)
  }

  const activeTrainingPlan = assignedPlans.find((plan) => plan.is_active)
  const activeNutritionPlan = assignedNutritionPlans.find((plan) => plan.is_active)
  const latestNutritionAssignment = assignedNutritionPlans[0]
  const nutritionManagePlanId = activeNutritionPlan?.plan_id ?? latestNutritionAssignment?.plan_id ?? null
  const lastProgress = progressLogs[0]
  const lastWorkout = historyLogs[0]
  const latestCheckin = checkins[0]
  const notesPreview = (client.notes ?? '').trim()
  const recentWorkouts = historyLogs.slice(0, 5)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {adminLightboxUrls.length > 0 && (
        <Lightbox
          urls={adminLightboxUrls}
          startIndex={adminLightboxIdx}
          onClose={() => setAdminLightboxUrls([])}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/clients" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Zurück zu Kunden
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold">
            {client.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.full_name}</h1>
            <p className="text-gray-500 text-sm">{client.email}{client.phone ? ` · ${client.phone}` : ''}</p>
          </div>
          <Link href="/admin/clients" className="ml-auto inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Kundenliste
          </Link>
          <Link href="/admin/plans" className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Trainingspläne
          </Link>
          <Link href="/admin/nutrition" className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Ernährung
          </Link>
          <Link href={`/admin/messages?client=${id}`} className="inline-flex items-center rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            Nachricht
          </Link>
        </div>
        {loadError && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {loadError}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
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

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">Kundendaten</h3>
              {!editingProfile && (
                <button
                  onClick={() => {
                    resetProfileForm()
                    setEditingProfile(true)
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  Bearbeiten
                </button>
              )}
            </div>
            {editingProfile ? (
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Name</label>
                  <input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Vollständiger Name"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">E-Mail</label>
                  <input
                    value={client.email}
                    disabled
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    placeholder="name@example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    E-Mail wird an dieser Stelle nicht bearbeitet.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Telefon</label>
                  <input
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Optional"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      resetProfileForm()
                      setEditingProfile(false)
                    }}
                    disabled={savingProfile}
                    className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="flex-1 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {savingProfile ? 'Speichere...' : 'Speichern'}
                  </button>
                </div>
              </div>
            ) : null}
            <dl className="space-y-3">
              <div className="flex gap-4">
                <dt className="text-sm text-gray-500 w-24 flex-shrink-0">Name</dt>
                <dd className="text-sm font-medium text-gray-900">{client.full_name}</dd>
              </div>
              <div className="flex gap-4">
                <dt className="text-sm text-gray-500 w-24 flex-shrink-0">E-Mail</dt>
                <dd className="text-sm text-gray-900">{client.email}</dd>
              </div>
              {client.phone && (
                <div className="flex gap-4">
                  <dt className="text-sm text-gray-500 w-24 flex-shrink-0">Telefon</dt>
                  <dd className="text-sm text-gray-900">{client.phone}</dd>
                </div>
              )}
              {client.notes && (
                <div className="flex gap-4">
                  <dt className="text-sm text-gray-500 w-24 flex-shrink-0">Notiz</dt>
                  <dd className="text-sm text-gray-900">{client.notes}</dd>
                </div>
              )}
              <div className="flex gap-4">
                <dt className="text-sm text-gray-500 w-24 flex-shrink-0">App-Zugang</dt>
                <dd className={`text-sm font-medium ${client.user_id ? 'text-green-600' : 'text-gray-400'}`}>
                  {client.user_id ? '✓ Verknüpft' : 'Noch nicht eingeloggt'}
                </dd>
              </div>
            </dl>

            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">Passwort zurücksetzen</span>
                {!resetPasswordOpen && (
                  <button
                    onClick={() => setResetPasswordOpen(true)}
                    disabled={!client.user_id}
                    className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    Bearbeiten
                  </button>
                )}
              </div>
              {!client.user_id ? (
                <p className="text-sm text-gray-500">
                  Passwort-Reset ist erst möglich, wenn der Kunde einen App-Zugang hat.
                </p>
              ) : resetPasswordOpen ? (
                <div className="space-y-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Neues Passwort (mind. 6 Zeichen)"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Passwort bestätigen"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setResetPasswordOpen(false)
                        setNewPassword('')
                        setConfirmNewPassword('')
                      }}
                      disabled={resettingPassword}
                      className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleResetPassword}
                      disabled={resettingPassword}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-60"
                    >
                      {resettingPassword ? 'Setze zurück...' : 'Zurücksetzen'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Setzt das Login-Passwort dieses Kunden neu.</p>
              )}
            </div>

            {/* Trainer Notes */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">Trainer-Notizen</span>
                {!editingNotes && (
                  <button onClick={() => setEditingNotes(true)} className="text-xs text-indigo-600 hover:text-indigo-800">
                    Bearbeiten
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notesValue}
                    onChange={e => setNotesValue(e.target.value)}
                    rows={4}
                    placeholder="Notizen zum Kunden…"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingNotes(false); setNotesValue(client.notes ?? '') }} className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                      Abbrechen
                    </button>
                    <button onClick={handleSaveNotesViaAdminRoute} disabled={savingNotes} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-60">
                      {savingNotes ? 'Speichern…' : 'Speichern'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 whitespace-pre-wrap">
                  {client.notes || <span className="italic text-gray-400">Noch keine Notizen.</span>}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{assignedPlans.filter(a => a.is_active).length}</div>
              <div className="text-gray-500 text-xs mt-1">Aktive Pläne</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{workoutLogs.length}</div>
              <div className="text-gray-500 text-xs mt-1">Einheiten gesamt</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center col-span-2 sm:col-span-1">
              <div className="text-2xl font-bold text-gray-900">
                {progressLogs[0]?.body_weight ? `${progressLogs[0].body_weight} kg` : '–'}
              </div>
              <div className="text-gray-500 text-xs mt-1">Letztes Gewicht</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold text-gray-900">Aktueller Status</h3>
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/plans" className="text-xs text-indigo-600 hover:underline">Trainingspläne</Link>
                <Link href="/admin/nutrition" className="text-xs text-indigo-600 hover:underline">Ernährung</Link>
                <Link href={`/admin/messages?client=${id}`} className="text-xs text-indigo-600 hover:underline">Nachrichten</Link>
              </div>
            </div>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500 text-xs">Training</dt>
                <dd className="text-gray-900 font-medium mt-0.5">
                  {activeTrainingPlan?.plan?.name ?? 'Kein aktiver Plan'}
                </dd>
                <p className="text-xs text-gray-500 mt-1">{assignedPlans.length} Plan-Zuweisungen gesamt</p>
                {activeTrainingPlan?.plan?.id ? (
                  <Link
                    href={`/admin/plans/${activeTrainingPlan.plan.id}`}
                    className="inline-flex mt-2 text-xs text-indigo-600 hover:underline"
                  >
                    Aktiven Plan öffnen
                  </Link>
                ) : null}
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500 text-xs">Ernährung</dt>
                <dd className="text-gray-900 font-medium mt-0.5">
                  {activeNutritionPlan?.plan_name ?? 'Kein aktiver Ernährungsplan'}
                </dd>
                <p className="text-xs text-gray-500 mt-1">{assignedNutritionPlans.length} Zuweisungen gesamt</p>
                {activeNutritionPlan?.plan_id ? (
                  <Link
                    href={`/admin/nutrition/${activeNutritionPlan.plan_id}`}
                    className="inline-flex mt-2 text-xs text-indigo-600 hover:underline"
                  >
                    Aktiven Ernährungsplan öffnen
                  </Link>
                ) : null}
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500 text-xs">Letzte Aktivität</dt>
                <dd className="text-gray-900 font-medium mt-0.5">
                  {lastWorkout
                    ? new Date(lastWorkout.date).toLocaleDateString('de-DE')
                    : 'Noch kein abgeschlossenes Training'}
                </dd>
                <p className="text-xs text-gray-500 mt-1">
                  Fortschritt: {lastProgress?.body_weight ? `${lastProgress.body_weight} kg` : 'kein Gewichtseintrag'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-gray-500 text-xs">Check-ins & Notizen</dt>
                <dd className="text-gray-900 font-medium mt-0.5">
                  {latestCheckin
                    ? `Letzter Check-in: ${new Date(latestCheckin.week_start).toLocaleDateString('de-DE')}`
                    : 'Noch kein Check-in'}
                </dd>
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {notesPreview ? `Notiz: ${notesPreview}` : 'Keine interne Notiz'}
                </p>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold text-gray-900">Trainingsfortschritt</h3>
              <Link href="#" onClick={(e) => { e.preventDefault(); setTab('history') }} className="text-xs text-indigo-600 hover:underline">
                Verlauf öffnen
              </Link>
            </div>
            {recentWorkouts.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine abgeschlossenen Workouts.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentWorkouts.map((log) => {
                  const dayName = (log.workout_day as { name: string } | null)?.name ?? 'Training'
                  const completedExerciseCount = new Set(
                    (log.exercise_logs ?? [])
                      .filter((setLog) => setLog.completed)
                      .map((setLog) => setLog.exercise?.name)
                      .filter((name): name is string => Boolean(name))
                  ).size
                  const duration = formatDuration(log.duration_seconds)
                  return (
                    <li key={log.id} className="rounded-lg bg-gray-50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{dayName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(log.date).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <div className="text-right text-xs text-gray-500 shrink-0">
                          {duration ? <p className="font-medium text-gray-700">{duration}</p> : null}
                          <p>{completedExerciseCount} Übung{completedExerciseCount !== 1 ? 'en' : ''} erledigt</p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold text-gray-900">Ernährungsübersicht</h3>
              <div className="flex flex-wrap gap-2">
                {nutritionManagePlanId ? (
                  <Link href={`/admin/nutrition/${nutritionManagePlanId}`} className="text-xs text-indigo-600 hover:underline">
                    Für Kunden verwalten
                  </Link>
                ) : (
                  <Link href="/admin/nutrition/new" className="text-xs text-indigo-600 hover:underline">
                    Plan erstellen
                  </Link>
                )}
                <Link href="/admin/nutrition" className="text-xs text-indigo-600 hover:underline">Pläne</Link>
                <Link href="/admin/nutrition/foods" className="text-xs text-indigo-600 hover:underline">Lebensmittel</Link>
                {activeNutritionPlan?.plan_id ? (
                  <Link href={`/admin/nutrition/${activeNutritionPlan.plan_id}`} className="text-xs text-indigo-600 hover:underline">
                    Aktiver Plan
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Status</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {activeNutritionPlan ? 'Aktiver Plan zugewiesen' : 'Kein aktiver Plan'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Zuweisungen</p>
                <p className="font-medium text-gray-900 mt-0.5">{assignedNutritionPlans.length}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Letzte Zuweisung</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {assignedNutritionPlans[0]
                    ? new Date(assignedNutritionPlans[0].assigned_at).toLocaleDateString('de-DE')
                    : 'Noch keine'}
                </p>
                {nutritionManagePlanId ? (
                  <Link href={`/admin/nutrition/${nutritionManagePlanId}`} className="inline-flex mt-2 text-xs text-indigo-600 hover:underline">
                    Zuweisung bearbeiten
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-semibold text-gray-900">Nachrichten & Kontakt</h3>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/messages?client=${id}`} className="text-xs text-indigo-600 hover:underline">
                  Chat öffnen
                </Link>
                <Link href="/admin/messages" className="text-xs text-indigo-600 hover:underline">
                  Inbox
                </Link>
              </div>
            </div>
            <div className="mb-3">
              {client.user_id ? (
                <Link
                  href={`/admin/messages?client=${id}`}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Nachricht an Kunden öffnen
                </Link>
              ) : (
                <p className="text-sm text-gray-500">
                  Messaging ist verfügbar, sobald der Kunde einen App-Zugang hat.
                </p>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Messaging-Status</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {client.user_id ? 'Verfügbar' : 'Noch nicht verfügbar'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {client.user_id ? 'Kunde hat App-Zugang.' : 'Kein App-Zugang verknüpft.'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">E-Mail</p>
                <p className="font-medium text-gray-900 mt-0.5 break-all">{client.email}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Telefon</p>
                <p className="font-medium text-gray-900 mt-0.5">{client.phone ?? 'Nicht hinterlegt'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans */}
      {tab === 'plans' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Aktiver Trainingsplan</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {activeTrainingPlan?.plan?.name ?? 'Aktuell ist kein Plan aktiv.'}
                </p>
              </div>
              {activeTrainingPlan?.plan?.id ? (
                <Link
                  href={`/admin/plans/${activeTrainingPlan.plan.id}`}
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Plan öffnen
                </Link>
              ) : (
                <Link
                  href="/admin/plans"
                  className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Zu Plänen
                </Link>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Plan zuweisen</h3>
            <div className="flex gap-3">
              <select
                value={selectedPlanId}
                onChange={e => setSelectedPlanId(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Plan auswählen…</option>
                {availablePlans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={handleAssignPlan}
                disabled={!selectedPlanId || assigning}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Zuweisen
              </button>
            </div>
            {availablePlans.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                <Link href="/admin/plans" className="text-indigo-600 hover:underline">Erst einen Plan erstellen</Link>
              </p>
            )}
          </div>

          {assignedPlans.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm">
              <p className="text-gray-500 text-sm">Noch kein Plan zugewiesen.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <ul className="divide-y divide-gray-100">
                {assignedPlans.map(ap => (
                  <li key={ap.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{(ap.plan as WorkoutPlan)?.name}</div>
                      <div className="text-xs text-gray-500">
                        Zugewiesen: {new Date(ap.assigned_at).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ap.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {ap.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <button onClick={() => togglePlanActive(ap.id, ap.is_active)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100">
                      {ap.is_active ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    {(ap.plan as WorkoutPlan | undefined)?.id ? (
                      <Link
                        href={`/admin/plans/${(ap.plan as WorkoutPlan).id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50"
                      >
                        Öffnen
                      </Link>
                    ) : null}
                    <button onClick={() => removePlan(ap.id)} className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="space-y-3">
          {historyLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
              <div className="text-4xl mb-3">🏋️</div>
              <p className="text-gray-500 text-sm">Noch kein Training abgeschlossen.</p>
            </div>
          ) : historyLogs.map(log => {
            const expanded = expandedLogIds.has(log.id)
            const dayName = (log.workout_day as { name: string } | null)?.name ?? 'Training'
            const duration = formatDuration(log.duration_seconds)
            const exLogs = log.exercise_logs ?? []
            // Group by exercise name
            const byExercise = exLogs.reduce<Record<string, ExerciseLogDetail[]>>((acc, el) => {
              const name = el.exercise?.name ?? 'Unbekannt'
              acc[name] = [...(acc[name] ?? []), el]
              return acc
            }, {})
            const exerciseCount = Object.keys(byExercise).length

            return (
              <div key={log.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => toggleLog(log.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{dayName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {duration && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg tabular-nums">{duration}</span>
                    )}
                    {exerciseCount > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                        {exerciseCount} Üb.
                      </span>
                    )}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded details */}
                {expanded && (
                  <div className="border-t border-gray-100">
                    {Object.keys(byExercise).length === 0 ? (
                      <p className="text-sm text-gray-400 px-5 py-4">Keine Satzdetails vorhanden.</p>
                    ) : Object.entries(byExercise).map(([exName, sets]) => {
                      const sortedSets = [...sets].sort((a, b) => (a.sets_done ?? 0) - (b.sets_done ?? 0))
                      return (
                        <div key={exName} className="px-5 py-3 border-b border-gray-50 last:border-0">
                          <p className="text-xs font-semibold text-gray-700 mb-2">{exName}</p>
                          <div className="space-y-1">
                            {/* Column headers */}
                            <div className="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-2 text-[11px] text-gray-400 font-medium px-1">
                              <span>Satz</span>
                              <span>Gewicht</span>
                              <span>Wdh.</span>
                              <span />
                            </div>
                            {sortedSets.map((set, i) => (
                              <div
                                key={set.id}
                                className={`grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-2 items-center px-1 py-1 rounded-lg text-sm ${
                                  set.completed ? 'bg-green-50' : 'bg-gray-50'
                                }`}
                              >
                                <span className="text-xs font-bold text-gray-400">{set.sets_done ?? i + 1}</span>
                                <span className="text-gray-700">
                                  {set.actual_weight ? `${set.actual_weight} kg` : '–'}
                                </span>
                                <span className="text-gray-700">{set.actual_reps ?? '–'}</span>
                                <span className={set.completed ? 'text-green-500' : 'text-gray-300'}>
                                  {set.completed
                                    ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  }
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Analyse */}
      {tab === 'analyse' && (
        <div className="space-y-4">
          {/* Week comparison */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Wochenvergleich</h3>
              <p className="text-xs text-gray-400 mt-0.5">Diese Woche vs. letzte Woche</p>
            </div>
            <div className="p-5 grid grid-cols-3 gap-4">
              {[
                { label: 'Trainings', cur: weeklyStats.workouts, prev: lastWeekStats.workouts, fmt: (v: number) => String(v) },
                { label: 'Zeit', cur: weeklyStats.seconds, prev: lastWeekStats.seconds, fmt: (v: number) => formatTotalDuration(v) },
                { label: 'Sätze', cur: weeklyStats.sets, prev: lastWeekStats.sets, fmt: (v: number) => String(v) },
              ].map(({ label, cur, prev, fmt }) => {
                const diff = cur - prev
                const color = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'
                return (
                  <div key={label}>
                    <div className="text-2xl font-bold text-gray-900">{fmt(cur)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                    {prev > 0 || cur > 0 ? (
                      <div className={`text-xs font-medium mt-1 ${color}`}>
                        {diff === 0 ? '= gleich' : `${diff > 0 ? '+' : ''}${fmt(diff)} vs. VW`}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Diese Woche</h3>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-6">
              <div>
                <div className="text-2xl font-bold text-gray-900">{weeklyStats.workouts}</div>
                <div className="text-xs text-gray-500 mt-1">Trainings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{formatTotalDuration(weeklyStats.seconds)}</div>
                <div className="text-xs text-gray-500 mt-1">Trainingszeit</div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-2xl font-bold text-gray-900">{weeklyStats.sets}</div>
                <div className="text-xs text-gray-500 mt-1">Erledigte Sätze</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Dieser Monat</h3>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-6">
              <div>
                <div className="text-2xl font-bold text-gray-900">{monthlyStats.workouts}</div>
                <div className="text-xs text-gray-500 mt-1">Trainings</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{formatTotalDuration(monthlyStats.seconds)}</div>
                <div className="text-xs text-gray-500 mt-1">Trainingszeit</div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-2xl font-bold text-gray-900">{monthlyStats.sets}</div>
                <div className="text-xs text-gray-500 mt-1">Erledigte Sätze</div>
              </div>
            </div>
          </div>

          {chartWeeks.length > 0 && (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Trainings pro Woche</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Letzte 8 Wochen</p>
                </div>
                <div className="px-5 pt-4 pb-5">
                  <BarChart
                    data={chartWeeks.map(w => ({ label: w.label, value: w.workouts }))}
                    color="#6366f1"
                    formatValue={v => String(v)}
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Trainingszeit pro Woche</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Letzte 8 Wochen</p>
                </div>
                <div className="px-5 pt-4 pb-5">
                  <BarChart
                    data={chartWeeks.map(w => ({ label: w.label, value: w.minutes }))}
                    color="#10b981"
                    formatValue={formatMinutes}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Progress */}
      {tab === 'progress' && (
        <div className="space-y-4">
          {progressLogs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center shadow-sm text-gray-500 text-sm">
              Noch keine Gewichtsdaten vorhanden.
            </div>
          ) : (
            <>
              {/* Weight chart */}
              {(() => {
                const chartData = [...progressLogs].reverse()
                  .map(l => ({ label: l.date, value: l.body_weight ?? 0 }))
                  .filter(d => d.value > 0)
                const latest = progressLogs[0]?.body_weight
                const oldest = progressLogs[progressLogs.length - 1]?.body_weight
                const change = latest && oldest ? latest - oldest : null
                return chartData.length >= 2 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-gray-900">Körpergewicht</h3>
                      {change !== null && (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${change < 0 ? 'text-green-700 bg-green-50' : change > 0 ? 'text-red-700 bg-red-50' : 'text-gray-500 bg-gray-100'}`}>
                          {change > 0 ? '+' : ''}{change.toFixed(1)} kg gesamt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Aktuell: {latest} kg</p>
                    <SvgLineChart data={chartData} />
                  </div>
                ) : null
              })()}

              {/* History list */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Verlauf</h3>
                </div>
                <ul className="divide-y divide-gray-100">
                  {progressLogs.map((log, i) => {
                    const prev = progressLogs[i + 1]
                    const diff = log.body_weight && prev?.body_weight ? log.body_weight - prev.body_weight : null
                    return (
                      <li key={log.id} className="flex items-center gap-4 px-6 py-3">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {log.body_weight ? `${log.body_weight} kg` : '–'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(log.date).toLocaleDateString('de-DE')}
                          </div>
                          {log.notes && <div className="text-xs text-gray-400 italic mt-0.5">{log.notes}</div>}
                        </div>
                        {diff !== null && (
                          <span className={`text-xs font-medium ${diff < 0 ? 'text-green-600' : diff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                          </span>
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

      {/* Check-ins */}
      {tab === 'checkins' && (
        <div className="space-y-4">
          {checkins.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center shadow-sm">
              <div className="text-3xl mb-2">📝</div>
              <p className="text-gray-500 text-sm">Noch keine Check-ins vorhanden.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Wöchentliche Check-ins</h3>
                <span className="text-xs text-gray-400">{checkins.length} Einträge</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {checkins.map(ci => (
                  <li key={ci.id} className="px-6 py-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Woche ab {new Date(ci.week_start).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Eingereicht: {new Date(ci.created_at).toLocaleDateString('de-DE')}
                        </div>
                      </div>
                      {ci.body_weight && (
                        <div className="text-right">
                          <div className="text-base font-bold text-emerald-600">{ci.body_weight} kg</div>
                          <div className="text-xs text-gray-400">Gewicht</div>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                      <AdminRatingBadge value={ci.mood} label="Stimmung" />
                      <AdminRatingBadge value={ci.energy} label="Energie" />
                      <AdminRatingBadge value={ci.sleep_quality} label="Schlaf" />
                      <AdminRatingBadge value={ci.hunger} label="Hunger" />
                      <AdminRatingBadge value={ci.stress} label="Stress" />
                    </div>
                    {ci.comment && (
                      <div className="bg-gray-50 rounded-xl px-4 py-3">
                        <p className="text-sm text-gray-600 italic">{ci.comment}</p>
                      </div>
                    )}

                    {/* Image gallery */}
                    {(ci.checkin_images?.length ?? 0) > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
                          Fotos ({ci.checkin_images!.length})
                        </p>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {ci.checkin_images!.map((img, imgIdx) => {
                            const url = adminSignedUrlMap[img.storage_path]
                            return url ? (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => openAdminLightbox(ci.checkin_images!, imgIdx)}
                                className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-gray-200 hover:ring-indigo-400 hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <Image
                                  src={url}
                                  alt={`Foto ${imgIdx + 1}`}
                                  fill
                                  className="object-cover"
                                />
                              </button>
                            ) : (
                              <div
                                key={img.id}
                                className="aspect-square rounded-xl bg-gray-100 animate-pulse"
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}
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
