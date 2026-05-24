import { supabase } from '@/lib/supabase'
import type { ExerciseLibraryItem } from '@/lib/types'

export type LibraryExercise = ExerciseLibraryItem
export type ExerciseCategory = 'Beine' | 'Bizeps' | 'Brust' | 'Gesäß' | 'Rücken' | 'Schultern' | 'Trizeps'

export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  'Beine',
  'Bizeps',
  'Brust',
  'Gesäß',
  'Rücken',
  'Schultern',
  'Trizeps',
]

const PAGE_SIZE = 1000

const normalizeCategoryKey = (value?: string | null) =>
  value
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') ?? ''

const CATEGORY_ALIASES: Record<ExerciseCategory, string[]> = {
  Beine: [
    'beine',
    'bein',
    'legs',
    'leg',
    'lower_body',
    'lowerbody',
    'lower',
    'quads',
    'quadriceps',
    'hamstrings',
    'waden',
    'calves',
  ],
  Bizeps: ['bizeps', 'biceps', 'bicep'],
  Brust: ['brust', 'chest', 'pectorals', 'pecs'],
  Gesäß: ['gesass', 'gesaess', 'glutes', 'glute', 'gluteus', 'butt', 'hips'],
  Rücken: ['rucken', 'ruecken', 'back', 'lat', 'lats', 'upper_back'],
  Schultern: ['schultern', 'shoulders', 'shoulder', 'delts', 'deltoids'],
  Trizeps: ['trizeps', 'triceps', 'tricep'],
}

export function getExerciseCategory(muscleGroup?: string | null): ExerciseCategory | null {
  const normalized = normalizeCategoryKey(muscleGroup)
  if (!normalized) return null

  for (const category of EXERCISE_CATEGORIES) {
    if (CATEGORY_ALIASES[category].includes(normalized)) {
      return category
    }
  }

  return null
}

export async function fetchExerciseLibrary(): Promise<ExerciseLibraryItem[]> {
  const rows: ExerciseLibraryItem[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('exercise_library')
      .select('*')
      .order('name', { ascending: true })
      .range(from, to)

    if (error) {
      console.error('[exercise-library] Failed to load exercises:', error)
      throw error
    }

    rows.push(...(data ?? []))

    if (!data || data.length < PAGE_SIZE) {
      return rows
    }
  }
}
