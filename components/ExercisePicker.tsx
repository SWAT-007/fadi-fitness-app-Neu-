'use client'

import { useState } from 'react'
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, type LibraryExercise } from '@/lib/exercises'

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
  const [muscleFilter, setMuscleFilter] = useState('')

  if (!open) return null

  const filteredExercises = muscleFilter
    ? EXERCISE_LIBRARY.filter(exercise => exercise.muscle_group === muscleFilter)
    : EXERCISE_LIBRARY

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <CloseIcon />
        </button>
        <h2 className="font-semibold text-gray-900">Übung auswählen</h2>
      </div>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100 flex-shrink-0">
        {(['', ...MUSCLE_GROUPS] as string[]).map(muscleGroup => (
          <button
            key={muscleGroup || 'all'}
            onClick={() => setMuscleFilter(muscleGroup)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              muscleFilter === muscleGroup
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {muscleGroup || 'Alle'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {filteredExercises.map(exercise => (
          <button
            key={exercise.id}
            onClick={() => onSelect(exercise)}
            className="w-full flex items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 text-sm">{exercise.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{exercise.muscle_group} · {exercise.equipment}</div>
            </div>
            <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-bold flex-shrink-0">+</span>
          </button>
        ))}
      </div>
    </div>
  )
}
