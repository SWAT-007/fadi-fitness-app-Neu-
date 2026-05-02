export type Role = 'trainer' | 'client'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  avatar_url?: string | null
  created_at: string
}

export interface Client {
  id: string
  trainer_id: string
  user_id?: string | null
  full_name: string
  email: string
  phone?: string | null
  notes?: string | null
  created_at: string
}

export interface WorkoutPlan {
  id: string
  trainer_id: string
  name: string
  description?: string | null
  training_days_per_week?: number | null
  duration_weeks?: number | null
  created_at: string
  workout_days?: WorkoutDay[]
}

export interface WorkoutDay {
  id: string
  plan_id: string
  name: string
  description?: string | null
  sort_order: number
  created_at: string
  exercises?: Exercise[]
}

export interface Exercise {
  id: string
  day_id: string
  name: string
  description?: string | null
  sets: number
  reps: string
  target_weight?: number | null
  rest_seconds?: number | null
  note?: string | null
  sort_order: number
  created_at: string
}

export interface AssignedPlan {
  id: string
  client_id: string
  plan_id: string
  assigned_at: string
  is_active: boolean
  plan?: WorkoutPlan
}

export interface WorkoutLog {
  id: string
  client_id: string
  day_id: string
  date: string
  notes?: string | null
  completed_at?: string | null
  duration_seconds?: number | null
  created_at: string
  workout_day?: WorkoutDay
  exercise_logs?: ExerciseLog[]
}

export interface ExerciseLog {
  id: string
  workout_log_id: string
  exercise_id: string
  actual_weight?: number | null
  actual_reps?: string | null
  sets_done?: number | null
  completed: boolean
  note?: string | null
  created_at: string
  exercise?: Exercise
}

export interface ProgressLog {
  id: string
  client_id: string
  date: string
  body_weight?: number | null
  notes?: string | null
  created_at: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  read_at?: string | null
  sender?: Profile
  receiver?: Profile
}

// ─── Nutrition ───────────────────────────────────────────────────────────────

export type NutritionGoal    = 'cut' | 'bulk' | 'maintain'
export type FoodCategory     = 'protein' | 'carbs' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'other'

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  protein:   'Proteinquelle',
  carbs:     'Kohlenhydratquelle',
  fat:       'Fettquelle',
  vegetable: 'Gemüse',
  fruit:     'Obst',
  dairy:     'Milchprodukt',
  other:     'Sonstiges',
}

/** Lebensmittel-Datenbank (globale Referenz) */
export interface Food {
  id: string
  name: string
  category: FoodCategory
  kcal_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  created_by?: string | null
  created_at: string
}

/** Strukturelle Form für Makro-Berechnung (Food, OffFood, …) */
export interface MacroSource {
  kcal_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
}

/** Berechnete Nährwerte für eine Grammzahl */
export function calcMacros(food: MacroSource, grams: number) {
  const f = grams / 100
  return {
    calories: Math.round(food.kcal_per_100g    * f * 10) / 10,
    protein:  Math.round(food.protein_per_100g * f * 10) / 10,
    carbs:    Math.round(food.carbs_per_100g   * f * 10) / 10,
    fat:      Math.round(food.fat_per_100g     * f * 10) / 10,
  }
}

/** Vom Trainer erlaubte Ersatz-Lebensmittel für einen Plan-Eintrag */
export interface FoodSwapOption {
  id: string
  nutrition_food_id: string
  food_id: string
  food?: Food
  created_at: string
}

/** Aktiver Tausch eines Clients */
export interface ClientFoodSwap {
  id: string
  client_id: string
  nutrition_food_id: string
  food_id: string
  amount_g: number
  food?: Food
  created_at: string
}

export interface NutritionFood {
  id: string
  meal_id: string
  name: string
  amount_g: number
  calories: number
  protein: number
  carbs: number
  fat: number
  sort_order: number
  food_id?: string | null       // Referenz zur foods-Tabelle (optional)
  swappable?: boolean           // Kann der Client dieses Lebensmittel tauschen?
  food?: Food                   // populated via join
  food_swap_options?: FoodSwapOption[]
  created_at: string
}

export interface NutritionMeal {
  id: string
  plan_id: string
  name: string
  sort_order: number
  // Makro-basiertes Modell (Schritt 2):
  target_kcal: number
  target_protein: number
  target_carbs: number
  target_fat: number
  target_vegetable_g: number
  allowed_categories: FoodCategory[]
  created_at: string
  nutrition_foods?: NutritionFood[]
}

/** Kunde wählt pro Mahlzeit Lebensmittel aus der foods-DB. */
export interface ClientMealFood {
  id: string
  client_id: string
  meal_id: string
  food_id: string
  amount_g: number
  sort_order: number
  food?: Food
  created_at: string
}

export interface NutritionPlan {
  id: string
  trainer_id: string
  name: string
  description?: string | null
  goal: NutritionGoal
  target_calories: number
  target_protein: number
  target_carbs: number
  target_fat: number
  created_at: string
  nutrition_meals?: NutritionMeal[]
}

export interface AssignedNutritionPlan {
  id: string
  client_id: string
  plan_id: string
  assigned_at: string
  is_active: boolean
  plan?: NutritionPlan
}

// ─── Check-in Images ─────────────────────────────────────────────────────────

export interface CheckinImage {
  id: string
  checkin_id: string
  storage_path: string
  created_at: string
}

export interface WeeklyCheckin {
  id: string
  client_id: string
  week_start: string
  body_weight?: number | null
  mood?: number | null
  energy?: number | null
  sleep_quality?: number | null
  hunger?: number | null
  stress?: number | null
  comment?: string | null
  created_at: string
  checkin_images?: CheckinImage[]
}
