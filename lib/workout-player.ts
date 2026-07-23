export type RequiredExercise = {
  id: string
  sets: number
}

export function countRemainingRequiredSets(
  exercises: readonly RequiredExercise[],
  isSetCompleted: (exerciseId: string, setIndex: number) => boolean,
): number {
  return exercises.reduce((remaining, exercise) => {
    const expectedSetCount = Math.max(1, exercise.sets)
    let openSets = 0

    for (let setIndex = 0; setIndex < expectedSetCount; setIndex += 1) {
      if (!isSetCompleted(exercise.id, setIndex)) {
        openSets += 1
      }
    }

    return remaining + openSets
  }, 0)
}

export function findNextIncompleteExerciseIndex(
  exercises: readonly RequiredExercise[],
  currentExerciseIndex: number,
  isSetCompleted: (exerciseId: string, setIndex: number) => boolean,
): number {
  if (exercises.length === 0) return -1

  for (let offset = 1; offset <= exercises.length; offset += 1) {
    const exerciseIndex = (currentExerciseIndex + offset) % exercises.length
    const exercise = exercises[exerciseIndex]
    const expectedSetCount = Math.max(1, exercise.sets)

    for (let setIndex = 0; setIndex < expectedSetCount; setIndex += 1) {
      if (!isSetCompleted(exercise.id, setIndex)) {
        return exerciseIndex
      }
    }
  }

  return -1
}

export type ExerciseMatchStrategy = 'exerciseId' | 'libraryId' | 'name'

export type LastPerformanceSet = {
  setNumber: number
  weightKg: number | null
  reps: string | null
}

export type LastPerformance = {
  exerciseId: string
  libraryId: string | null
  exerciseName: string
  completedAt: string
  matchedBy: ExerciseMatchStrategy
  sets: LastPerformanceSet[]
  // Compact fallback retained for clients that cannot consume per-set history.
  weightKg: number | null
  reps: string | null
}

export type CurrentExerciseIdentity = {
  id: string
  name: string
  libraryId?: string | null
}

export type HistoricalExerciseLog = {
  exerciseId: string
  libraryId?: string | null
  exerciseName: string
  setNumber: number | null
  weightKg: number | null
  reps: string | null
  createdAt: string
}

export type HistoricalWorkout = {
  id: string
  completedAt: string
  createdAt: string
  exerciseLogs: HistoricalExerciseLog[]
}

export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE')
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function hasPerformanceValue(
  value: Pick<HistoricalExerciseLog, 'weightKg' | 'reps'>,
): boolean {
  return value.weightKg !== null || Boolean(value.reps?.trim())
}

function groupExerciseLogs(workout: HistoricalWorkout): HistoricalExerciseLog[][] {
  const groups = new Map<string, HistoricalExerciseLog[]>()

  for (const log of workout.exerciseLogs) {
    const existing = groups.get(log.exerciseId) ?? []
    existing.push(log)
    groups.set(log.exerciseId, existing)
  }

  return [...groups.values()]
}

function findLatestMatch(
  workouts: readonly HistoricalWorkout[],
  matches: (logs: HistoricalExerciseLog[]) => boolean,
): { workout: HistoricalWorkout; logs: HistoricalExerciseLog[] } | null {
  for (const workout of workouts) {
    const matchingGroups = groupExerciseLogs(workout).filter(matches)
    // A fallback must never guess between two same-identity exercises in one session.
    if (matchingGroups.length === 1) {
      return { workout, logs: matchingGroups[0] }
    }
  }

  return null
}

export function buildLastPerformanceByExercise(
  currentExercises: readonly CurrentExerciseIdentity[],
  history: readonly HistoricalWorkout[],
): Record<string, LastPerformance> {
  const orderedHistory = [...history].sort((a, b) => (
    timestamp(b.completedAt) - timestamp(a.completedAt)
    || timestamp(b.createdAt) - timestamp(a.createdAt)
  ))
  const currentExerciseIds = new Set(currentExercises.map((exercise) => exercise.id))
  const result: Record<string, LastPerformance> = {}

  for (const current of currentExercises) {
    let matchedBy: ExerciseMatchStrategy = 'exerciseId'
    let match = findLatestMatch(
      orderedHistory,
      (logs) => logs[0]?.exerciseId === current.id,
    )

    if (!match && current.libraryId) {
      matchedBy = 'libraryId'
      match = findLatestMatch(
        orderedHistory,
        (logs) => logs[0]?.libraryId === current.libraryId,
      )
    }

    if (!match) {
      const normalizedCurrentName = normalizeExerciseName(current.name)
      matchedBy = 'name'
      match = findLatestMatch(
        orderedHistory,
        (logs) => {
          const historicalExerciseId = logs[0]?.exerciseId
          // Do not leak another exercise from the current workout into an exercise
          // that merely happens to have the same name.
          if (!historicalExerciseId || currentExerciseIds.has(historicalExerciseId)) {
            return false
          }
          return normalizeExerciseName(logs[0]?.exerciseName ?? '') === normalizedCurrentName
        },
      )
    }

    if (!match || match.logs.length === 0) continue

    const numberedLogs = match.logs
      .filter((log): log is HistoricalExerciseLog & { setNumber: number } => (
        Number.isInteger(log.setNumber) && (log.setNumber ?? 0) > 0
      ))
      .sort((a, b) => a.setNumber - b.setNumber || timestamp(a.createdAt) - timestamp(b.createdAt))

    const setsByNumber = new Map<number, LastPerformanceSet>()
    for (const log of numberedLogs) {
      setsByNumber.set(log.setNumber, {
        setNumber: log.setNumber,
        weightKg: log.weightKg,
        reps: log.reps,
      })
    }
    const sets = [...setsByNumber.values()].sort((a, b) => a.setNumber - b.setNumber)

    const compactFallback = [...match.logs]
      .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))
      .find(hasPerformanceValue)
    const lastWorkingSet = [...numberedLogs].reverse().find(hasPerformanceValue)
      ?? compactFallback
      ?? numberedLogs[numberedLogs.length - 1]
      ?? match.logs[match.logs.length - 1]

    result[current.id] = {
      exerciseId: match.logs[0].exerciseId,
      libraryId: match.logs[0].libraryId ?? null,
      exerciseName: match.logs[0].exerciseName,
      completedAt: match.workout.completedAt,
      matchedBy,
      sets,
      weightKg: lastWorkingSet?.weightKg ?? null,
      reps: lastWorkingSet?.reps ?? null,
    }
  }

  return result
}

export function getSuggestedPerformanceForSet(
  performance: LastPerformance | null | undefined,
  setIndex: number,
): LastPerformanceSet | null {
  if (!performance) return null

  const requestedSetNumber = setIndex + 1
  const orderedSets = [...performance.sets].sort((a, b) => a.setNumber - b.setNumber)

  if (orderedSets.length > 0) {
    const exactSet = orderedSets.find((set) => set.setNumber === requestedSetNumber)
    if (exactSet) return exactSet

    const lastHistoricalSet = orderedSets[orderedSets.length - 1]
    if (requestedSetNumber > lastHistoricalSet.setNumber) {
      return [...orderedSets].reverse().find((set) => (
        set.weightKg !== null || Boolean(set.reps?.trim())
      )) ?? lastHistoricalSet
    }

    return null
  }

  if (performance.weightKg === null && !performance.reps?.trim()) {
    return null
  }

  return {
    setNumber: requestedSetNumber,
    weightKg: performance.weightKg,
    reps: performance.reps,
  }
}
