export type BodyWeightProgressInput = {
  id: string
  date: string
  bodyWeight: number | null | undefined
  createdAt: string
  notes?: string | null
}

export type BodyWeightCheckinInput = {
  id: string
  bodyWeight: number | null | undefined
  createdAt: string
  updatedAt?: string | null
}

export type BodyWeightHistoryEntry = {
  id: string
  date: string
  bodyWeight: number
  createdAt: string
  notes: string | null
  source: 'progress-log' | 'checkin'
}

export type BodyWeightPeriod = 'week' | 'month' | 'quarter' | 'year'

export type BodyWeightPeriodSummary = {
  entries: BodyWeightHistoryEntry[]
  change: number | null
  startWeight: number | null
  endWeight: number | null
}

const padDatePart = (value: number) => String(value).padStart(2, '0')

export function currentLocalDateKey(date: Date = new Date()): string {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-')
}

export function parseBodyWeightInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function dateKeyInTimeZone(
  value: string | Date,
  timeZone = 'Europe/Berlin',
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = new Map(parts.map(part => [part.type, part.value]))

  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

export function buildBodyWeightHistory(
  progressLogs: readonly BodyWeightProgressInput[],
  checkins: readonly BodyWeightCheckinInput[],
): BodyWeightHistoryEntry[] {
  const progressEntries = progressLogs.flatMap<BodyWeightHistoryEntry>(log => {
    if (!Number.isFinite(log.bodyWeight) || Number(log.bodyWeight) <= 0) return []

    return [{
      id: `progress-log:${log.id}`,
      date: log.date,
      bodyWeight: Number(log.bodyWeight),
      createdAt: log.createdAt,
      notes: log.notes ?? null,
      source: 'progress-log',
    }]
  })

  const checkinEntries = checkins.flatMap<BodyWeightHistoryEntry>(checkin => {
    if (!Number.isFinite(checkin.bodyWeight) || Number(checkin.bodyWeight) <= 0) return []

    const recordedAt = checkin.updatedAt || checkin.createdAt
    const date = dateKeyInTimeZone(recordedAt)
    if (!date) return []

    return [{
      id: `checkin:${checkin.id}`,
      date,
      bodyWeight: Number(checkin.bodyWeight),
      createdAt: recordedAt,
      notes: null,
      source: 'checkin',
    }]
  })

  // A weight may have been entered both through the quick action and the weekly
  // check-in. Prefer the dedicated progress log and only suppress exact duplicates.
  const dedicatedEntryKeys = new Set(
    progressEntries.map(entry => `${entry.date}:${entry.bodyWeight}`),
  )
  return [
    ...progressEntries,
    ...checkinEntries.filter(entry => (
      !dedicatedEntryKeys.has(`${entry.date}:${entry.bodyWeight}`)
    )),
  ]
    .sort((a, b) => (
      b.date.localeCompare(a.date)
      || b.createdAt.localeCompare(a.createdAt)
      || b.id.localeCompare(a.id)
    ))
}

function subtractBodyWeightPeriod(dateKey: string, period: BodyWeightPeriod): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return ''

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])

  if (period === 'week') {
    const date = new Date(Date.UTC(year, monthIndex, day))
    date.setUTCDate(date.getUTCDate() - 7)
    return date.toISOString().slice(0, 10)
  }

  const monthsToSubtract = period === 'month' ? 1 : period === 'quarter' ? 3 : 12
  const targetMonthStart = new Date(Date.UTC(year, monthIndex - monthsToSubtract, 1))
  const targetYear = targetMonthStart.getUTCFullYear()
  const targetMonth = targetMonthStart.getUTCMonth()
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTargetMonth)))
  return targetDate.toISOString().slice(0, 10)
}

export function summarizeBodyWeightPeriod(
  history: readonly BodyWeightHistoryEntry[],
  period: BodyWeightPeriod,
): BodyWeightPeriodSummary {
  if (history.length === 0) {
    return { entries: [], change: null, startWeight: null, endWeight: null }
  }

  const ordered = [...history].sort((a, b) => (
    b.date.localeCompare(a.date)
    || b.createdAt.localeCompare(a.createdAt)
    || b.id.localeCompare(a.id)
  ))
  const latest = ordered[0]
  const cutoffDate = subtractBodyWeightPeriod(latest.date, period)
  const entries = ordered.filter(entry => entry.date >= cutoffDate)
  const baseline = ordered.find(entry => entry.date <= cutoffDate)

  if (baseline && !entries.some(entry => entry.id === baseline.id)) {
    entries.push(baseline)
  }

  const oldest = entries[entries.length - 1]
  const startWeight = oldest?.bodyWeight ?? null
  const endWeight = latest.bodyWeight

  return {
    entries,
    change: entries.length >= 2 && startWeight !== null ? endWeight - startWeight : null,
    startWeight,
    endWeight,
  }
}
