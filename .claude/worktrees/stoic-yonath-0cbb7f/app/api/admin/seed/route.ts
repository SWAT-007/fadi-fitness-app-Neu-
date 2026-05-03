import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, getEmailFromJwt, getUserIdFromJwt, isAdminEmail } from '@/lib/admin'

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

type DayExercise = { id: string; sets: number; target_weight: number | null }
type WorkoutDay = { id: string; exercises: DayExercise[] }
type AssignedWithPlan = { plan: { workout_days: WorkoutDay[] } | null }
type SeedResult =
  | { client_id: string; workouts: number; exerciseLogs: number; progressLogs: number }
  | { client_id: string; skipped: true; reason: string }
  | { client_id: string; error: string }

const seedError = (message: string, status = 500) =>
  NextResponse.json({ ok: false, message }, { status })

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
    if (!accessToken) return seedError('Admin-Cookie fehlt. Bitte erneut anmelden.', 401)

    const adminEmail = getEmailFromJwt(accessToken)
    if (!isAdminEmail(adminEmail)) {
      return seedError('Nicht autorisiert: Nur Admins dürfen Testdaten generieren.', 403)
    }

    const trainerId = getUserIdFromJwt(accessToken)
    if (!trainerId) return seedError('Admin-Token enthält keine Benutzer-ID. Bitte erneut anmelden.', 401)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl) return seedError('Supabase URL fehlt in der Umgebung.', 500)
    if (!serviceKey && !anonKey) return seedError('Supabase API Key fehlt in der Umgebung.', 500)

    const supabase = serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : createClient(supabaseUrl, anonKey!, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        })

    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('id')
      .eq('trainer_id', trainerId)

    if (clientsErr) return seedError(`Kunden konnten nicht geladen werden: ${clientsErr.message}`, 500)
    if (!clients?.length) return seedError('Keine Kunden gefunden.', 404)

    const now = new Date()
    const startDate = new Date(now)
    startDate.setMonth(startDate.getMonth() - 3)
    startDate.setDate(1)
    const startStr = startDate.toISOString().split('T')[0]
    const endStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
    const results: SeedResult[] = []

    for (const client of clients) {
      const { data: assigned, error: assignedErr } = await supabase
        .from('assigned_plans')
        .select('plan:workout_plans(workout_days(id, exercises(id, sets, target_weight)))')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (assignedErr) {
        results.push({ client_id: client.id, error: `Aktiver Plan konnte nicht geladen werden: ${assignedErr.message}` })
        continue
      }

      const days: WorkoutDay[] = (assigned as AssignedWithPlan | null)?.plan?.workout_days ?? []
      if (!days.length) {
        results.push({ client_id: client.id, skipped: true, reason: 'Kein aktiver Plan' })
        continue
      }

      const { data: existingLogs, error: existingErr } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('client_id', client.id)
        .gte('date', startStr)
        .lte('date', endStr)
        .not('completed_at', 'is', null)

      if (existingErr) {
        results.push({ client_id: client.id, error: `Vorhandene Trainingsdaten konnten nicht gelesen werden: ${existingErr.message}` })
        continue
      }

      if (existingLogs?.length) {
        const ids = existingLogs.map(log => log.id)
        const { error: deleteExerciseErr } = await supabase.from('exercise_logs').delete().in('workout_log_id', ids)
        if (deleteExerciseErr) {
          results.push({ client_id: client.id, error: `Satzdetails konnten nicht gelöscht werden: ${deleteExerciseErr.message}` })
          continue
        }

        const { error: deleteWorkoutErr } = await supabase.from('workout_logs').delete().in('id', ids)
        if (deleteWorkoutErr) {
          results.push({ client_id: client.id, error: `Trainingsdaten konnten nicht gelöscht werden: ${deleteWorkoutErr.message}` })
          continue
        }
      }

      const { error: deleteProgressErr } = await supabase
        .from('progress_logs')
        .delete()
        .eq('client_id', client.id)
        .gte('date', startStr)
        .lte('date', endStr)

      if (deleteProgressErr) {
        results.push({ client_id: client.id, error: `Gewichtsverlauf konnte nicht gelöscht werden: ${deleteProgressErr.message}` })
        continue
      }

      const workoutInserts: Array<{
        client_id: string
        day_id: string
        date: string
        completed_at: string
        duration_seconds: number
      }> = []
      const cursor = new Date(startDate)
      const trainingDays = new Set([1, 3, 5])
      let dayIndex = 0

      while (cursor.toISOString().split('T')[0] <= endStr) {
        const wd = cursor.getDay()
        const trains = trainingDays.has(wd) || (wd === 6 && Math.random() < 0.35)

        if (trains && Math.random() < 0.82) {
          const day = days[dayIndex % days.length]
          dayIndex++
          const completed = new Date(cursor)
          completed.setHours(rand(7, 20), rand(0, 50), 0, 0)
          workoutInserts.push({
            client_id: client.id,
            day_id: day.id,
            date: cursor.toISOString().split('T')[0],
            completed_at: completed.toISOString(),
            duration_seconds: rand(2100, 4500),
          })
        }

        cursor.setDate(cursor.getDate() + 1)
      }

      const { data: insertedLogs, error: logsErr } = await supabase
        .from('workout_logs')
        .insert(workoutInserts)
        .select('id, day_id')

      if (logsErr) {
        results.push({ client_id: client.id, error: `Trainingsdaten konnten nicht erstellt werden: ${logsErr.message}` })
        continue
      }

      const exLogs: Array<{
        workout_log_id: string
        exercise_id: string
        sets_done: number
        actual_weight: number
        actual_reps: string
        completed: boolean
      }> = []
      const totalLogs = insertedLogs?.length ?? 0

      for (let li = 0; li < totalLogs; li++) {
        const log = insertedLogs![li]
        const day = days.find(candidate => candidate.id === log.day_id)
        const progress = li / Math.max(totalLogs - 1, 1)

        for (const ex of day?.exercises ?? []) {
          const baseWeight = ex.target_weight ?? rand(20, 60)
          const progressWeight = Math.round((baseWeight * (1 + progress * 0.08) + rand(-3, 3)) * 2) / 2
          const numSets = ex.sets ?? 3

          for (let s = 1; s <= numSets; s++) {
            const repChoices = ['6', '8', '8', '10', '10', '12', '12', '15']
            exLogs.push({
              workout_log_id: log.id,
              exercise_id: ex.id,
              sets_done: s,
              actual_weight: Math.max(5, progressWeight),
              actual_reps: repChoices[rand(0, repChoices.length - 1)],
              completed: Math.random() < 0.88,
            })
          }
        }
      }

      let exerciseInsertError = ''
      for (let i = 0; i < exLogs.length; i += 100) {
        const { error } = await supabase.from('exercise_logs').insert(exLogs.slice(i, i + 100))
        if (error) {
          exerciseInsertError = error.message
          break
        }
      }
      if (exerciseInsertError) {
        results.push({ client_id: client.id, error: `Satzdetails konnten nicht erstellt werden: ${exerciseInsertError}` })
        continue
      }

      const progressInserts: Array<{ client_id: string; date: string; body_weight: number }> = []
      const pCursor = new Date(startDate)
      let weight = 83.5

      while (pCursor.toISOString().split('T')[0] <= endStr) {
        weight = Math.max(79, Math.min(87, weight + (Math.random() * 0.8 - 0.45)))
        weight = Math.round(weight * 10) / 10
        progressInserts.push({
          client_id: client.id,
          date: pCursor.toISOString().split('T')[0],
          body_weight: weight,
        })
        pCursor.setDate(pCursor.getDate() + rand(5, 9))
      }

      const { error: progressErr } = await supabase.from('progress_logs').insert(progressInserts)
      if (progressErr) {
        results.push({ client_id: client.id, error: `Gewichtsverlauf konnte nicht erstellt werden: ${progressErr.message}` })
        continue
      }

      results.push({
        client_id: client.id,
        workouts: workoutInserts.length,
        exerciseLogs: exLogs.length,
        progressLogs: progressInserts.length,
      })
    }

    return NextResponse.json({ ok: true, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return seedError(`Testdaten konnten nicht generiert werden: ${message}`, 500)
  }
}
