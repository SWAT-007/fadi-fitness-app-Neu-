// Temporary guard (Step B): durationSeconds is currently derived from
// completedAt - createdAt of a WorkoutLog. Resumed/abandoned logs can produce
// huge outliers (e.g. 51h). Until real time-tracking (Step A) lands, any value
// above this cap is treated as unknown (null) on delivery — DB stays untouched.
export const MAX_WORKOUT_DURATION_SECONDS = 10800; // 3 hours

/**
 * Returns the duration unchanged when it is a valid, plausible value
 * (0 <= s <= MAX_WORKOUT_DURATION_SECONDS), otherwise null.
 * Pure read-side clamp — never writes to the database.
 */
export function clampDuration(
  seconds: number | null | undefined,
): number | null {
  if (typeof seconds !== "number") return null;
  if (seconds > MAX_WORKOUT_DURATION_SECONDS) return null;
  return seconds;
}
