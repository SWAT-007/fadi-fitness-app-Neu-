'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  EXERCISE_CATEGORIES,
  fetchExerciseLibrary,
  getExerciseCategory,
  resolveImageUrl,
  type ExerciseCategory,
  type LibraryExercise,
} from '@/lib/exercises'

type ExercisePickerProps = {
  open: boolean
  onClose: () => void
  onSelect: (exercise: LibraryExercise) => void
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function ExercisePicker({ open, onClose, onSelect }: ExercisePickerProps) {
  const [library, setLibrary] = useState<LibraryExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [muscleFilter, setMuscleFilter] = useState<ExerciseCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadError('')
    setMuscleFilter('all')
    setSearch('')

    fetchExerciseLibrary()
      .then(data => {
        setLibrary(data)
      })
      .catch(error => {
        console.error('[ExercisePicker] Could not load exercise library:', error)
        setLibrary([])
        setLoadError('Uebungen konnten nicht geladen werden. Bitte versuche es erneut.')
      })
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const query = search.trim().toLowerCase()
  const filtered = library.filter(exercise => {
    const matchMuscle = muscleFilter === 'all' || getExerciseCategory(exercise.muscle_group) === muscleFilter
    const matchSearch = !query || exercise.name.toLowerCase().includes(query)
    return matchMuscle && matchSearch
  })

  const categoryCount = (category: ExerciseCategory) =>
    library.filter(exercise => getExerciseCategory(exercise.muscle_group) === category).length

  return (
    <div className="fixed inset-0 z-50 bg-black/72 backdrop-blur-md lg:left-[260px]">
      <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#050504] shadow-[0_32px_90px_-36px_rgba(0,0,0,0.92)]">
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#111318] px-4 py-4 sm:px-5">
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#111111] text-[#797D83] transition-colors hover:border-white/[0.12] hover:text-[#EDECEA]"
            >
              <CloseIcon />
            </button>
            <h2
              className="flex-1 text-3xl uppercase leading-none text-[#EDECEA] sm:text-4xl"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Uebung auswaehlen
            </h2>
            <Link
              href="/admin/exercises"
              className="text-xs font-medium uppercase tracking-[0.18em] text-[#A78BFA] transition-colors hover:text-[#C4B5FD]"
            >
              Datenbank verwalten
            </Link>
          </div>

          <div className="flex-shrink-0 space-y-4 border-b border-white/[0.06] bg-[#050504] px-4 py-4 sm:px-5">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Suchen..."
              className="w-full rounded-2xl border border-white/[0.06] bg-[#111111] px-4 py-3 text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:border-[#A78BFA]/40 focus:outline-none"
            />
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-color:rgba(167,139,250,0.32)_transparent] [scrollbar-width:thin]">
              <button
                onClick={() => setMuscleFilter('all')}
                className={`flex-shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                  muscleFilter === 'all'
                    ? 'border-[#A78BFA] bg-[#A78BFA] text-white'
                    : 'border-white/[0.06] bg-[#111111] text-[#EDECEA] hover:border-white/[0.12] hover:bg-[#1a1a1a]'
                }`}
              >
                Alle <span className="opacity-70">{library.length}</span>
              </button>
              {EXERCISE_CATEGORIES.map(group => (
                <button
                  key={group}
                  onClick={() => setMuscleFilter(group)}
                  className={`flex-shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                    muscleFilter === group
                      ? 'border-[#A78BFA] bg-[#A78BFA] text-white'
                      : 'border-white/[0.06] bg-[#111111] text-[#EDECEA] hover:border-white/[0.12] hover:bg-[#1a1a1a]'
                  }`}
                >
                  {group} <span className="opacity-70">{categoryCount(group)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#050504] px-4 py-4 sm:px-5 [scrollbar-color:rgba(167,139,250,0.32)_transparent] [scrollbar-width:thin]">
            {loading ? (
              <div className="flex justify-center p-8">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#A78BFA] border-t-transparent" />
              </div>
            ) : loadError ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center text-sm text-red-300">
                {loadError}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/[0.06] bg-[#111111] p-8 text-center text-sm text-[#797D83]">
                {library.length === 0 ? (
                  <>
                    Die Uebungs-Datenbank ist leer.<br />
                    <Link href="/admin/exercises" className="text-[#A78BFA] hover:underline">Erste Uebung anlegen -&gt;</Link>
                  </>
                ) : (
                  'Keine Uebung gefunden.'
                )}
              </div>
            ) : (
              <ul className="space-y-3 pb-6">
                {filtered.map(exercise => (
                  <li key={exercise.id}>
                    <button
                      onClick={() => onSelect(exercise)}
                      className="flex w-full items-center gap-4 rounded-3xl border border-white/[0.06] bg-[#111111] px-4 py-3.5 text-left transition-colors hover:bg-[#1a1a1a] active:bg-[#1f1f1f] sm:px-5"
                    >
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#1a1a1a] ring-1 ring-white/[0.05] sm:h-16 sm:w-16">
                        {resolveImageUrl(exercise.image_url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={resolveImageUrl(exercise.image_url)!} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs text-[#797D83]">--</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-semibold text-[#EDECEA] sm:text-[17px]">{exercise.name}</div>
                        {(exercise.muscle_group || exercise.equipment) && (
                          <div className="mt-1 text-xs text-[#797D83] sm:text-sm">
                            {[exercise.muscle_group, exercise.equipment].filter(Boolean).join(' - ')}
                          </div>
                        )}
                      </div>
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[#A78BFA] text-xl font-bold text-white shadow-[0_10px_24px_-14px_rgba(167,139,250,0.9)] transition-transform duration-200 hover:scale-105">
                        +
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
