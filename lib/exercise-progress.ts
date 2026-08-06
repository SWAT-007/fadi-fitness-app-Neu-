export type ExerciseProgressLog = {
  weight: number | null
  reps: string | null
  completed: boolean
  exerciseName: string | null
}

export type ExerciseProgressWorkout = {
  id: string
  date: string
  completedAt?: string | null
  workoutName?: string | null
  exerciseLogs: readonly ExerciseProgressLog[]
}

export type ExerciseProgressPoint = {
  workoutId: string
  date: string
  completedAt: string | null
  workoutName: string | null
  value: number
  weight: number | null
  reps: number | null
}

export type ExerciseProgressSeries = {
  name: string
  metric: 'weight' | 'reps'
  points: ExerciseProgressPoint[]
  current: number
  best: number
  change: number
  changePercent: number | null
}

type WorkoutExercisePerformance = {
  workoutId: string
  date: string
  completedAt: string | null
  workoutName: string | null
  name: string
  weight: number | null
  reps: number | null
}

function normalizeExerciseName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
}

function parseReps(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildExerciseProgress(
  workouts: readonly ExerciseProgressWorkout[],
): ExerciseProgressSeries[] {
  const performancesByExercise = new Map<string, WorkoutExercisePerformance[]>()

  for (const workout of workouts) {
    const performancesInWorkout = new Map<string, WorkoutExercisePerformance>()

    for (const log of workout.exerciseLogs) {
      const displayName = log.exerciseName?.trim()
      if (!log.completed || !displayName) continue

      const weight = typeof log.weight === 'number' && log.weight > 0 ? log.weight : null
      const reps = parseReps(log.reps)
      if (weight === null && reps === null) continue

      const key = normalizeExerciseName(displayName)
      const existing = performancesInWorkout.get(key)
      const next: WorkoutExercisePerformance = existing ?? {
        workoutId: workout.id,
        date: workout.date,
        completedAt: workout.completedAt ?? null,
        workoutName: workout.workoutName ?? null,
        name: displayName,
        weight: null,
        reps: null,
      }

      if (weight !== null && (next.weight === null || weight > next.weight)) {
        next.weight = weight
        next.reps = reps
      } else if (next.weight === null && reps !== null && (next.reps === null || reps > next.reps)) {
        next.reps = reps
      }

      performancesInWorkout.set(key, next)
    }

    for (const [key, performance] of performancesInWorkout) {
      const existing = performancesByExercise.get(key) ?? []
      existing.push(performance)
      performancesByExercise.set(key, existing)
    }
  }

  return [...performancesByExercise.values()]
    .map((performances): ExerciseProgressSeries | null => {
      const ordered = [...performances].sort((a, b) => (
        timestamp(a.completedAt ?? a.date) - timestamp(b.completedAt ?? b.date)
        || a.workoutId.localeCompare(b.workoutId)
      ))
      const metric: ExerciseProgressSeries['metric'] = ordered.some(item => item.weight !== null)
        ? 'weight'
        : 'reps'
      const points = ordered.flatMap((item): ExerciseProgressPoint[] => {
        const value = metric === 'weight' ? item.weight : item.reps
        if (value === null) return []
        return [{ ...item, value }]
      })
      if (points.length === 0) return null

      const current = points[points.length - 1].value
      const first = points[0].value
      const change = current - first

      return {
        name: ordered[ordered.length - 1].name,
        metric,
        points,
        current,
        best: Math.max(...points.map(point => point.value)),
        change,
        changePercent: first > 0 ? (change / first) * 100 : null,
      }
    })
    .filter((series): series is ExerciseProgressSeries => series !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'de-DE'))
}
