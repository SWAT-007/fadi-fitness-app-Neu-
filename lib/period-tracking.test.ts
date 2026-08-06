import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDaysToDateKey,
  daysBetweenDateKeys,
  isValidDateKey,
  summarizePeriodTracking,
} from './period-tracking'

test('validates real calendar dates and calculates date-key differences', () => {
  assert.equal(isValidDateKey('2026-02-28'), true)
  assert.equal(isValidDateKey('2026-02-30'), false)
  assert.equal(daysBetweenDateKeys('2026-02-28', '2026-03-02'), 2)
  assert.equal(addDaysToDateKey('2026-02-28', 2), '2026-03-02')
})

test('summarizes cycle and period averages from completed entries', () => {
  const summary = summarizePeriodTracking([
    { startDate: '2026-05-01', endDate: '2026-05-05' },
    { startDate: '2026-05-29', endDate: '2026-06-02' },
    { startDate: '2026-06-27', endDate: null },
  ], '2026-07-01')

  assert.equal(summary.averageCycleDays, 29)
  assert.equal(summary.averagePeriodDays, 5)
  assert.equal(summary.currentCycleDay, 5)
  assert.equal(summary.predictedNextStart, '2026-07-26')
  assert.equal(summary.daysUntilNext, 25)
  assert.equal(summary.activeEntry?.startDate, '2026-06-27')
})

test('uses a 28-day estimate until two period starts exist', () => {
  const summary = summarizePeriodTracking([
    { startDate: '2026-08-01', endDate: '2026-08-04' },
  ], '2026-08-06')

  assert.equal(summary.averageCycleDays, null)
  assert.equal(summary.predictedNextStart, '2026-08-29')
  assert.equal(summary.daysUntilNext, 23)
})

test('ignores implausible cycle intervals when calculating the average', () => {
  const summary = summarizePeriodTracking([
    { startDate: '2026-01-01', endDate: '2026-01-05' },
    { startDate: '2026-04-15', endDate: '2026-04-20' },
  ], '2026-04-20')

  assert.equal(summary.averageCycleDays, null)
})
