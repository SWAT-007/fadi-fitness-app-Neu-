import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('NEXT_PUBLIC_SUPABASE_URL fehlt.')
  process.exit(1)
}

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY fehlt. Für Testdaten in geschützten Tabellen wird der Service-Key benötigt.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function dateOnly(date) {
  return date.toISOString().split('T')[0]
}

async function main() {
  const { data: clients, error: clientError } = await supabase
    .from('clients')
    .select('id, full_name')
    .ilike('full_name', '%kamilla%')

  if (clientError) throw new Error(`Kamilla konnte nicht gesucht werden: ${clientError.message}`)
  if (!clients?.length) throw new Error('Keine Kundin mit Name "Kamilla" gefunden.')
  if (clients.length > 1) {
    throw new Error(`Mehrere Kundinnen gefunden: ${clients.map(client => `${client.full_name} (${client.id})`).join(', ')}`)
  }

  const client = clients[0]

  const { data: assigned, error: assignedError } = await supabase
    .from('assigned_plans')
    .select('plan:workout_plans(workout_days(id, exercises(id, sets, target_weight)))')
    .eq('client_id', client.id)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (assignedError) throw new Error(`Aktiver Plan konnte nicht geladen werden: ${assignedError.message}`)

  const days = assigned?.plan?.workout_days ?? []
  if (!days.length) throw new Error('Kamilla hat keinen aktiven Plan mit Trainingstagen.')

  const now = new Date()
  const startDate = new Date(now)
  startDate.setMonth(startDate.getMonth() - 3)
  startDate.setDate(1)
  const startStr = dateOnly(startDate)
  const endStr = dateOnly(new Date(now.getTime() - 86400000))

  const { data: existingLogs, error: existingError } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('client_id', client.id)
    .gte('date', startStr)
    .lte('date', endStr)
    .not('completed_at', 'is', null)

  if (existingError) throw new Error(`Bestehende Trainingsdaten konnten nicht gelesen werden: ${existingError.message}`)

  if (existingLogs?.length) {
    const ids = existingLogs.map(log => log.id)
    const { error: exerciseDeleteError } = await supabase.from('exercise_logs').delete().in('workout_log_id', ids)
    if (exerciseDeleteError) throw new Error(`Alte Satzdetails konnten nicht gelöscht werden: ${exerciseDeleteError.message}`)

    const { error: workoutDeleteError } = await supabase.from('workout_logs').delete().in('id', ids)
    if (workoutDeleteError) throw new Error(`Alte Trainingsdaten konnten nicht gelöscht werden: ${workoutDeleteError.message}`)
  }

  const { error: progressDeleteError } = await supabase
    .from('progress_logs')
    .delete()
    .eq('client_id', client.id)
    .gte('date', startStr)
    .lte('date', endStr)

  if (progressDeleteError) throw new Error(`Alter Fortschritt konnte nicht gelöscht werden: ${progressDeleteError.message}`)

  const workoutInserts = []
  const cursor = new Date(startDate)
  const trainingDays = new Set([1, 3, 5])
  let dayIndex = 0

  while (dateOnly(cursor) <= endStr) {
    const wd = cursor.getDay()
    const trains = trainingDays.has(wd) || (wd === 6 && Math.random() < 0.35)

    if (trains && Math.random() < 0.84) {
      const day = days[dayIndex % days.length]
      dayIndex++
      const completed = new Date(cursor)
      completed.setHours(rand(7, 20), rand(0, 50), 0, 0)
      workoutInserts.push({
        client_id: client.id,
        day_id: day.id,
        date: dateOnly(cursor),
        completed_at: completed.toISOString(),
        duration_seconds: rand(2100, 4500),
      })
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  const { data: insertedLogs, error: workoutInsertError } = await supabase
    .from('workout_logs')
    .insert(workoutInserts)
    .select('id, day_id')

  if (workoutInsertError) throw new Error(`Trainingsdaten konnten nicht erstellt werden: ${workoutInsertError.message}`)

  const exerciseLogs = []
  const totalLogs = insertedLogs?.length ?? 0

  for (let li = 0; li < totalLogs; li++) {
    const log = insertedLogs[li]
    const day = days.find(candidate => candidate.id === log.day_id)
    const progress = li / Math.max(totalLogs - 1, 1)

    for (const exercise of day?.exercises ?? []) {
      const baseWeight = exercise.target_weight ?? rand(20, 60)
      const progressWeight = Math.round((baseWeight * (1 + progress * 0.08) + rand(-3, 3)) * 2) / 2
      const numSets = exercise.sets ?? 3

      for (let set = 1; set <= numSets; set++) {
        const reps = ['6', '8', '8', '10', '10', '12', '12', '15']
        exerciseLogs.push({
          workout_log_id: log.id,
          exercise_id: exercise.id,
          sets_done: set,
          actual_weight: Math.max(5, progressWeight),
          actual_reps: reps[rand(0, reps.length - 1)],
          completed: Math.random() < 0.9,
        })
      }
    }
  }

  for (let i = 0; i < exerciseLogs.length; i += 100) {
    const { error } = await supabase.from('exercise_logs').insert(exerciseLogs.slice(i, i + 100))
    if (error) throw new Error(`Satzdetails konnten nicht erstellt werden: ${error.message}`)
  }

  const progressInserts = []
  const pCursor = new Date(startDate)
  let weight = 76.5

  while (dateOnly(pCursor) <= endStr) {
    weight = Math.max(72, Math.min(78, weight + (Math.random() * 0.7 - 0.42)))
    weight = Math.round(weight * 10) / 10
    progressInserts.push({
      client_id: client.id,
      date: dateOnly(pCursor),
      body_weight: weight,
      notes: null,
    })
    pCursor.setDate(pCursor.getDate() + rand(5, 9))
  }

  const { error: progressInsertError } = await supabase.from('progress_logs').insert(progressInserts)
  if (progressInsertError) throw new Error(`Fortschritt konnte nicht erstellt werden: ${progressInsertError.message}`)

  console.log(`Testdaten für ${client.full_name} erstellt.`)
  console.log(`Zeitraum: ${startStr} bis ${endStr}`)
  console.log(`Trainings: ${workoutInserts.length}`)
  console.log(`Satzdetails: ${exerciseLogs.length}`)
  console.log(`Gewichtslogs: ${progressInserts.length}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
