import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBodyWeightHistory,
  currentLocalDateKey,
  dateKeyInTimeZone,
  parseBodyWeightInput,
  summarizeBodyWeightPeriod,
} from './body-weight'

test('parses German and international decimal body-weight input', () => {
  assert.equal(parseBodyWeightInput('82,5'), 82.5)
  assert.equal(parseBodyWeightInput('82.5'), 82.5)
  assert.equal(parseBodyWeightInput(' 71 '), 71)
  assert.equal(parseBodyWeightInput(''), null)
  assert.equal(parseBodyWeightInput('0'), null)
  assert.equal(parseBodyWeightInput('abc'), null)
})

test('uses the device-local calendar date instead of the UTC date', () => {
  const localDate = new Date(2026, 6, 25, 0, 30)
  assert.equal(currentLocalDateKey(localDate), '2026-07-25')
})

test('derives the Berlin calendar date for a check-in timestamp', () => {
  assert.equal(
    dateKeyInTimeZone('2026-07-24T22:30:00.000Z'),
    '2026-07-25',
  )
})

test('combines daily entries and check-in weights without changing source data', () => {
  const progressLogs = [{
    id: 'daily-yesterday',
    date: '2026-07-24',
    bodyWeight: 81.2,
    createdAt: '2026-07-24T07:00:00.000Z',
    notes: null,
  }]
  const checkins = [{
    id: 'checkin-today',
    bodyWeight: 80.8,
    createdAt: '2026-07-25T08:00:00.000Z',
    updatedAt: '2026-07-25T08:00:00.000Z',
  }]

  const history = buildBodyWeightHistory(progressLogs, checkins)

  assert.deepEqual(history.map(entry => ({
    id: entry.id,
    date: entry.date,
    bodyWeight: entry.bodyWeight,
  })), [
    { id: 'checkin:checkin-today', date: '2026-07-25', bodyWeight: 80.8 },
    { id: 'progress-log:daily-yesterday', date: '2026-07-24', bodyWeight: 81.2 },
  ])
  assert.equal(progressLogs[0].id, 'daily-yesterday')
  assert.equal(checkins[0].id, 'checkin-today')
})

test('prefers a dedicated progress entry over an exact check-in duplicate', () => {
  const history = buildBodyWeightHistory(
    [{
      id: 'daily',
      date: '2026-07-25',
      bodyWeight: 80,
      createdAt: '2026-07-25T09:00:00.000Z',
    }],
    [{
      id: 'checkin',
      bodyWeight: 80,
      createdAt: '2026-07-25T08:00:00.000Z',
    }],
  )

  assert.equal(history.length, 1)
  assert.equal(history[0].source, 'progress-log')
})

test('orders multiple same-day daily entries by the newest persisted entry', () => {
  const history = buildBodyWeightHistory([
    {
      id: 'older',
      date: '2026-07-25',
      bodyWeight: 81,
      createdAt: '2026-07-25T07:00:00.000Z',
    },
    {
      id: 'newer',
      date: '2026-07-25',
      bodyWeight: 80.7,
      createdAt: '2026-07-25T10:00:00.000Z',
    },
  ], [])

  assert.deepEqual(history.map(entry => entry.bodyWeight), [80.7, 81])
})

test('keeps separately persisted daily entries even when their values match', () => {
  const history = buildBodyWeightHistory([
    {
      id: 'older',
      date: '2026-07-25',
      bodyWeight: 80,
      createdAt: '2026-07-25T07:00:00.000Z',
    },
    {
      id: 'newer',
      date: '2026-07-25',
      bodyWeight: 80,
      createdAt: '2026-07-25T10:00:00.000Z',
    },
  ], [])

  assert.deepEqual(history.map(entry => entry.id), [
    'progress-log:newer',
    'progress-log:older',
  ])
})

test('summarizes a week using the closest baseline at the period start', () => {
  const history = buildBodyWeightHistory([
    {
      id: 'latest',
      date: '2026-05-27',
      bodyWeight: 61.8,
      createdAt: '2026-05-27T08:00:00.000Z',
    },
    {
      id: 'middle',
      date: '2026-05-24',
      bodyWeight: 62.1,
      createdAt: '2026-05-24T08:00:00.000Z',
    },
    {
      id: 'baseline',
      date: '2026-05-19',
      bodyWeight: 62.5,
      createdAt: '2026-05-19T08:00:00.000Z',
    },
  ], [])

  const summary = summarizeBodyWeightPeriod(history, 'week')

  assert.deepEqual(summary.entries.map(entry => entry.date), [
    '2026-05-27',
    '2026-05-24',
    '2026-05-19',
  ])
  assert.equal(summary.startWeight, 62.5)
  assert.equal(summary.endWeight, 61.8)
  assert.ok(Math.abs((summary.change ?? 0) - (-0.7)) < 1e-9)
})

test('supports calendar month, quarter, and year weight periods', () => {
  const history = buildBodyWeightHistory([
    { id: 'latest', date: '2026-03-31', bodyWeight: 75, createdAt: '2026-03-31T08:00:00.000Z' },
    { id: 'month', date: '2026-02-28', bodyWeight: 76, createdAt: '2026-02-28T08:00:00.000Z' },
    { id: 'quarter', date: '2025-12-31', bodyWeight: 78, createdAt: '2025-12-31T08:00:00.000Z' },
    { id: 'year', date: '2025-03-31', bodyWeight: 82, createdAt: '2025-03-31T08:00:00.000Z' },
  ], [])

  assert.equal(summarizeBodyWeightPeriod(history, 'month').change, -1)
  assert.equal(summarizeBodyWeightPeriod(history, 'quarter').change, -3)
  assert.equal(summarizeBodyWeightPeriod(history, 'year').change, -7)
})

test('does not calculate a period change from only one measurement', () => {
  const history = buildBodyWeightHistory([
    { id: 'only', date: '2026-05-27', bodyWeight: 61.8, createdAt: '2026-05-27T08:00:00.000Z' },
  ], [])

  assert.equal(summarizeBodyWeightPeriod(history, 'month').change, null)
})
