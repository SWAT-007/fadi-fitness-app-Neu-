export type PeriodEntryLike = {
  startDate: string
  endDate?: string | null
}

export type PeriodTrackingSummary = {
  activeEntry: PeriodEntryLike | null
  averageCycleDays: number | null
  averagePeriodDays: number | null
  currentCycleDay: number | null
  predictedNextStart: string | null
  daysUntilNext: number | null
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function daysBetweenDateKeys(from: string, to: string): number | null {
  if (!isValidDateKey(from) || !isValidDateKey(to)) return null
  const fromMs = Date.parse(`${from}T00:00:00.000Z`)
  const toMs = Date.parse(`${to}T00:00:00.000Z`)
  return Math.round((toMs - fromMs) / 86_400_000)
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  if (!isValidDateKey(dateKey) || !Number.isFinite(days)) return null
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + Math.round(days))
  return date.toISOString().slice(0, 10)
}

export function summarizePeriodTracking(
  entries: readonly PeriodEntryLike[],
  today: string,
): PeriodTrackingSummary {
  const ordered = entries
    .filter(entry => isValidDateKey(entry.startDate))
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

  const activeEntry = ordered.find(entry => !entry.endDate) ?? null
  const chronological = [...ordered].reverse()
  const cycleLengths = chronological.slice(1).flatMap((entry, index) => {
    const days = daysBetweenDateKeys(chronological[index].startDate, entry.startDate)
    return days !== null && days >= 15 && days <= 60 ? [days] : []
  })
  const averageCycleDays = cycleLengths.length > 0
    ? Math.round(cycleLengths.reduce((sum, value) => sum + value, 0) / cycleLengths.length)
    : null

  const periodLengths = ordered.flatMap(entry => {
    if (!entry.endDate) return []
    const days = daysBetweenDateKeys(entry.startDate, entry.endDate)
    return days !== null && days >= 0 && days <= 20 ? [days + 1] : []
  })
  const averagePeriodDays = periodLengths.length > 0
    ? Math.round(periodLengths.reduce((sum, value) => sum + value, 0) / periodLengths.length)
    : null

  const latestStart = ordered[0]?.startDate ?? null
  const currentCycleOffset = latestStart ? daysBetweenDateKeys(latestStart, today) : null
  const currentCycleDay = currentCycleOffset !== null && currentCycleOffset >= 0
    ? currentCycleOffset + 1
    : null
  const predictedNextStart = latestStart
    ? addDaysToDateKey(latestStart, averageCycleDays ?? 28)
    : null
  const daysUntilNext = predictedNextStart
    ? daysBetweenDateKeys(today, predictedNextStart)
    : null

  return {
    activeEntry,
    averageCycleDays,
    averagePeriodDays,
    currentCycleDay,
    predictedNextStart,
    daysUntilNext,
  }
}
