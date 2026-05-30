import type { ExerciseLibraryItem } from '@/lib/types'

export type LibraryExercise = ExerciseLibraryItem

const BACKEND_URL =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000')
    : 'http://localhost:4000'

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  if (url.startsWith('/uploads')) return `${BACKEND_URL}${url}`
  return null
}
export type ExerciseCategory = 'Beine' | 'Bizeps' | 'Brust' | 'Gesäß' | 'Rücken' | 'Schultern' | 'Trizeps'

type BackendExerciseLibraryItem = {
  id?: string
  name?: string
  muscleGroup?: string | null
  equipment?: string | null
  imageUrl?: string | null
  createdAt?: string
}

export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  'Beine',
  'Bizeps',
  'Brust',
  'Gesäß',
  'Rücken',
  'Schultern',
  'Trizeps',
]

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
  let response: Response
  try {
    response = await fetch('/api/backend/exercises/library', {
      method: 'GET',
      cache: 'no-store',
    })
  } catch (error) {
    console.error('[exercise-library] Backend unavailable:', error)
    throw new Error('Backend unavailable')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload.message === 'string' ? payload.message : 'Failed to load exercise library'
    if (response.status === 401) {
      throw new Error('Unauthorized')
    }
    throw new Error(message)
  }

  const backendRows: BackendExerciseLibraryItem[] =
    payload && Array.isArray(payload.exercises) ? payload.exercises : []

  return backendRows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    muscle_group: typeof row.muscleGroup === 'string' ? row.muscleGroup : null,
    equipment: typeof row.equipment === 'string' ? row.equipment : null,
    image_url: typeof row.imageUrl === 'string' ? row.imageUrl : null,
    created_by: null,
    created_at: typeof row.createdAt === 'string' ? row.createdAt : new Date(0).toISOString(),
  }))
}
