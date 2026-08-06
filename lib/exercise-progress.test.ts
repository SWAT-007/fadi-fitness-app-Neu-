import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExerciseProgress, type ExerciseProgressWorkout } from './exercise-progress'

test('builds one chronological weight point per exercise and workout', () => {
  const workouts: ExerciseProgressWorkout[] = [
    {
      id: 'new',
      date: '2026-08-05',
      completedAt: '2026-08-05T18:00:00.000Z',
      workoutName: 'Push',
      exerciseLogs: [
        { exerciseName: 'Brustpresse', weight: 65, reps: '8', completed: true },
        { exerciseName: 'Brustpresse', weight: 70, reps: '6', completed: true },
      ],
    },
    {
      id: 'old',
      date: '2026-07-20',
      completedAt: '2026-07-20T18:00:00.000Z',
      workoutName: 'Push',
      exerciseLogs: [
        { exerciseName: ' Brustpresse ', weight: 60, reps: '8', completed: true },
      ],
    },
  ]

  const [series] = buildExerciseProgress(workouts)

  assert.equal(series.name, 'Brustpresse')
  assert.equal(series.metric, 'weight')
  assert.deepEqual(series.points.map(point => point.value), [60, 70])
  assert.equal(series.points[1].reps, 6)
  assert.equal(series.current, 70)
  assert.equal(series.best, 70)
  assert.equal(series.change, 10)
})

test('uses repetitions for bodyweight exercises without recorded weight', () => {
  const workouts: ExerciseProgressWorkout[] = [
    {
      id: 'one',
      date: '2026-07-20',
      exerciseLogs: [
        { exerciseName: 'Klimmzüge', weight: null, reps: '8', completed: true },
      ],
    },
    {
      id: 'two',
      date: '2026-08-05',
      exerciseLogs: [
        { exerciseName: 'Klimmzüge', weight: null, reps: '11', completed: true },
      ],
    },
  ]

  const [series] = buildExerciseProgress(workouts)

  assert.equal(series.metric, 'reps')
  assert.deepEqual(series.points.map(point => point.value), [8, 11])
  assert.equal(series.change, 3)
  assert.equal(series.changePercent, 37.5)
})

test('ignores incomplete sets and completed sets without performance values', () => {
  const result = buildExerciseProgress([{
    id: 'one',
    date: '2026-08-05',
    exerciseLogs: [
      { exerciseName: 'Rudern', weight: 50, reps: '10', completed: false },
      { exerciseName: 'Plank', weight: null, reps: null, completed: true },
    ],
  }])

  assert.deepEqual(result, [])
})
