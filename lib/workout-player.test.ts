import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLastPerformanceByExercise,
  countRemainingRequiredSets,
  findNextIncompleteExerciseIndex,
  getSuggestedPerformanceForSet,
  type HistoricalWorkout,
} from './workout-player'

test('workout completion depends on every required set, not the visible exercise order', () => {
  const exercises = [
    { id: 'exercise-1', sets: 2 },
    { id: 'exercise-2', sets: 2 },
    { id: 'exercise-3', sets: 2 },
    { id: 'exercise-4', sets: 2 },
  ]
  const completed = new Set(['exercise-4:1', 'exercise-4:2'])
  const remaining = countRemainingRequiredSets(
    exercises,
    (exerciseId, setIndex) => completed.has(`${exerciseId}:${setIndex + 1}`),
  )

  assert.equal(remaining, 6)

  for (const exercise of exercises.slice(0, 3)) {
    completed.add(`${exercise.id}:1`)
    completed.add(`${exercise.id}:2`)
  }

  assert.equal(
    countRemainingRequiredSets(
      exercises,
      (exerciseId, setIndex) => completed.has(`${exerciseId}:${setIndex + 1}`),
    ),
    0,
  )
})

test('after the last exercise it wraps to the next exercise with an open set', () => {
  const exercises = [
    { id: 'exercise-1', sets: 2 },
    { id: 'exercise-2', sets: 2 },
    { id: 'exercise-3', sets: 2 },
    { id: 'exercise-4', sets: 2 },
  ]
  const completed = new Set([
    'exercise-3:1',
    'exercise-3:2',
    'exercise-4:1',
    'exercise-4:2',
  ])

  assert.equal(
    findNextIncompleteExerciseIndex(
      exercises,
      3,
      (exerciseId, setIndex) => completed.has(`${exerciseId}:${setIndex + 1}`),
    ),
    0,
  )

  completed.add('exercise-1:1')
  completed.add('exercise-1:2')
  assert.equal(
    findNextIncompleteExerciseIndex(
      exercises,
      3,
      (exerciseId, setIndex) => completed.has(`${exerciseId}:${setIndex + 1}`),
    ),
    1,
  )
})

test('there is no next exercise when every required set is complete', () => {
  const exercises = [
    { id: 'exercise-1', sets: 1 },
    { id: 'exercise-2', sets: 1 },
  ]

  assert.equal(
    findNextIncompleteExerciseIndex(exercises, 1, () => true),
    -1,
  )
})

test('stable exercise id wins over a newer normalized-name fallback', () => {
  const history: HistoricalWorkout[] = [
    {
      id: 'newer-workout',
      completedAt: '2026-07-22T10:00:00.000Z',
      createdAt: '2026-07-22T09:00:00.000Z',
      exerciseLogs: [{
        exerciseId: 'copied-bench',
        exerciseName: '  BANKDRÜCKEN ',
        setNumber: 1,
        weightKg: 90,
        reps: '5',
        createdAt: '2026-07-22T09:30:00.000Z',
      }],
    },
    {
      id: 'older-workout',
      completedAt: '2026-07-20T10:00:00.000Z',
      createdAt: '2026-07-20T09:00:00.000Z',
      exerciseLogs: [{
        exerciseId: 'bench',
        exerciseName: 'Bankdrücken',
        setNumber: 1,
        weightKg: 60,
        reps: '8',
        createdAt: '2026-07-20T09:30:00.000Z',
      }],
    },
  ]

  const result = buildLastPerformanceByExercise(
    [{ id: 'bench', name: 'Bankdrücken', libraryId: null }],
    history,
  )

  assert.equal(result.bench.matchedBy, 'exerciseId')
  assert.equal(result.bench.weightKg, 60)
  assert.equal(result.bench.reps, '8')
})

test('library identity is used across plans before the name fallback', () => {
  const history: HistoricalWorkout[] = [{
    id: 'workout',
    completedAt: '2026-07-22T10:00:00.000Z',
    createdAt: '2026-07-22T09:00:00.000Z',
    exerciseLogs: [
      {
        exerciseId: 'same-name-wrong-library',
        libraryId: 'row-library',
        exerciseName: 'Rudern',
        setNumber: 1,
        weightKg: 80,
        reps: '6',
        createdAt: '2026-07-22T09:20:00.000Z',
      },
      {
        exerciseId: 'copied-row',
        libraryId: 'bench-library',
        exerciseName: 'Bankdrücken',
        setNumber: 1,
        weightKg: 60,
        reps: '8',
        createdAt: '2026-07-22T09:30:00.000Z',
      },
    ],
  }]

  const result = buildLastPerformanceByExercise(
    [{ id: 'new-plan-bench', name: 'Bankdrücken', libraryId: 'bench-library' }],
    history,
  )

  assert.equal(result['new-plan-bench'].matchedBy, 'libraryId')
  assert.equal(result['new-plan-bench'].exerciseId, 'copied-row')
  assert.equal(result['new-plan-bench'].weightKg, 60)
})

test('per-set suggestions stay with their exercise and extra sets use the last working set', () => {
  const history: HistoricalWorkout[] = [{
    id: 'workout',
    completedAt: '2026-07-22T10:00:00.000Z',
    createdAt: '2026-07-22T09:00:00.000Z',
    exerciseLogs: [
      {
        exerciseId: 'bench',
        exerciseName: 'Bankdrücken',
        setNumber: 1,
        weightKg: 60,
        reps: '8',
        createdAt: '2026-07-22T09:10:00.000Z',
      },
      {
        exerciseId: 'bench',
        exerciseName: 'Bankdrücken',
        setNumber: 2,
        weightKg: 62.5,
        reps: '7',
        createdAt: '2026-07-22T09:15:00.000Z',
      },
      {
        exerciseId: 'row',
        exerciseName: 'Rudern',
        setNumber: 1,
        weightKg: 35,
        reps: '12',
        createdAt: '2026-07-22T09:20:00.000Z',
      },
    ],
  }]

  const result = buildLastPerformanceByExercise(
    [
      { id: 'bench', name: 'Bankdrücken' },
      { id: 'row', name: 'Rudern' },
      { id: 'unknown', name: 'Kniebeuge' },
    ],
    history,
  )

  assert.deepEqual(getSuggestedPerformanceForSet(result.bench, 0), {
    setNumber: 1,
    weightKg: 60,
    reps: '8',
  })
  assert.deepEqual(getSuggestedPerformanceForSet(result.bench, 1), {
    setNumber: 2,
    weightKg: 62.5,
    reps: '7',
  })
  assert.deepEqual(getSuggestedPerformanceForSet(result.bench, 2), {
    setNumber: 2,
    weightKg: 62.5,
    reps: '7',
  })
  assert.equal(result.row.weightKg, 35)
  assert.equal(result.row.reps, '12')
  assert.equal(result.unknown, undefined)
})

test('an exercise without history does not inherit a same-name current exercise', () => {
  const history: HistoricalWorkout[] = [{
    id: 'workout',
    completedAt: '2026-07-22T10:00:00.000Z',
    createdAt: '2026-07-22T09:00:00.000Z',
    exerciseLogs: [{
      exerciseId: 'bench-a',
      exerciseName: 'Bankdrücken',
      setNumber: 1,
      weightKg: 60,
      reps: '8',
      createdAt: '2026-07-22T09:30:00.000Z',
    }],
  }]

  const result = buildLastPerformanceByExercise(
    [
      { id: 'bench-a', name: 'Bankdrücken' },
      { id: 'bench-b', name: 'Bankdrücken' },
    ],
    history,
  )

  assert.equal(result['bench-a'].weightKg, 60)
  assert.equal(result['bench-b'], undefined)
})
