const roundTo = (value: number, precision: number) => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

/**
 * Distributes a daily macro target across meal targets without producing
 * negative values. Increases are shared evenly; reductions keep the existing
 * meal ratio. The final value absorbs any rounding remainder.
 */
export function distributeNutritionTarget(
  target: number,
  currentValues: number[],
  precision = 1,
): number[] {
  if (currentValues.length === 0) return []

  const safeTarget = Number.isFinite(target) ? Math.max(0, target) : 0
  const safeValues = currentValues.map(value =>
    Number.isFinite(value) ? Math.max(0, value) : 0,
  )
  const currentTotal = safeValues.reduce((sum, value) => sum + value, 0)

  const distributed = currentTotal === 0
    ? safeValues.map(() => safeTarget / safeValues.length)
    : currentTotal <= safeTarget
      ? safeValues.map(value => value + (safeTarget - currentTotal) / safeValues.length)
      : safeValues.map(value => value * (safeTarget / currentTotal))

  const rounded = distributed.map(value => roundTo(value, precision))
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0)
  rounded[rounded.length - 1] = roundTo(
    Math.max(0, rounded[rounded.length - 1] + safeTarget - roundedTotal),
    precision,
  )

  return rounded
}
