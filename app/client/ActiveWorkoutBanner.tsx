'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type ActiveWorkout = {
  id: string
  dayId: string
  createdAt: string
  day: {
    id: string
    name: string
    plan: {
      id: string
      name: string
    } | null
  } | null
}

type ActiveWorkoutResponse = {
  activeWorkout?: ActiveWorkout | null
  message?: string
}

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ActiveWorkoutBanner() {
  const pathname = usePathname()
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null)
  const [now, setNow] = useState<number | null>(null)

  const isOnPlayer = /\/workout\/.+\/play/.test(pathname)

  useEffect(() => {
    if (isOnPlayer) { setActiveWorkout(null); return }

    const load = async () => {
      try {
        const response = await fetch('/api/backend/me/active-workout', { cache: 'no-store' })
        if (response.status === 401) {
          setActiveWorkout(null)
          return
        }

        const payload = await response.json().catch(() => null) as ActiveWorkoutResponse | null
        if (!response.ok) {
          setActiveWorkout(null)
          return
        }

        setActiveWorkout(payload?.activeWorkout ?? null)
      } catch {
        setActiveWorkout(null)
      }
    }

    load()
  }, [pathname, isOnPlayer])

  useEffect(() => {
    if (!activeWorkout) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [activeWorkout])

  if (!activeWorkout || isOnPlayer) return null

  const startedAt = new Date(activeWorkout.createdAt).getTime()
  const elapsed = Math.max(0, Math.floor(((now ?? startedAt) - startedAt) / 1000))

  return (
    <Link
      href={`/client/workout/${activeWorkout.dayId}/play`}
      className="flex items-center justify-between bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative flex-shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 block animate-pulse" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-emerald-200 font-semibold uppercase tracking-widest leading-none mb-0.5">
            Aktives Training
          </p>
          <p className="font-bold text-sm truncate">
            {activeWorkout.day?.name ?? 'Training'}
            <span className="font-normal text-emerald-300 ml-2 tabular-nums">{formatTime(elapsed)}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 bg-white/20 px-3 py-1.5 rounded-lg flex-shrink-0 ml-3 text-sm font-semibold">
        Fortsetzen
        <svg className="w-3.5 h-3.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
