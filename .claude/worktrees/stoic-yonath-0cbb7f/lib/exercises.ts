import { supabase } from '@/lib/supabase'
import type { ExerciseLibraryItem } from '@/lib/types'

export type LibraryExercise = ExerciseLibraryItem

export async function fetchExerciseLibrary(): Promise<ExerciseLibraryItem[]> {
  const { data } = await supabase
    .from('exercise_library')
    .select('*')
    .order('name')
  return data ?? []
}
