'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchExerciseLibrary, type LibraryExercise } from '@/lib/exercises'

type ExercisePickerProps = {
  open: boolean
  onClose: () => void
  onSelect: (exercise: LibraryExercise) => void
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function ExercisePicker({ open, onClose, onSelect }: ExercisePickerProps) {
  const [library, setLibrary] = useState<LibraryExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [muscleFilter, setMuscleFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetchExerciseLibrary().then(data => {
      setLibrary(data)
      setLoading(false)
    })
  }, [open])

  if (!open) return null

  const muscleGroups = Array.from(new Set(library.map(e => e.muscle_group).filter(Boolean) as string[])).sort()

  const filtered = library.filter(e => {
    const matchMuscle = !muscleFilter || e.muscle_group === muscleFilter
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
    return matchMuscle && matchSearch
  })

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <CloseIcon />
        </button>
        <h2 className="font-semibold text-gray-900 flex-1">Übung auswählen</h2>
        <Link href="/admin/exercises" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
          Datenbank verwalten
        </Link>
      </div>

      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 space-y-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {muscleGroups.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {(['', ...muscleGroups]).map(group => (
              <button
                key={group || 'all'}
                onClick={() => setMuscleFilter(group)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  muscleFilter === group
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {group || 'Alle'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {library.length === 0 ? (
              <>
                Die Übungs-Datenbank ist leer.<br />
                <Link href="/admin/exercises" className="text-indigo-600 hover:underline">Erste Übung anlegen →</Link>
              </>
            ) : (
              'Keine Übung gefunden.'
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(exercise => (
              <li key={exercise.id}>
                <button
                  onClick={() => onSelect(exercise)}
                  className="w-full flex items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {exercise.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={exercise.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{exercise.name}</div>
                    {(exercise.muscle_group || exercise.equipment) && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {[exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-bold flex-shrink-0">+</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
