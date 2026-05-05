import { NextResponse } from 'next/server'
import path from 'path'
import { cookies } from 'next/headers'
import { getUserFromAccessToken, ADMIN_AUTH_COOKIE, isAdminEmail } from '@/lib/admin'
import { parseAllPdfsInDir } from '@/lib/recipeParser'
import { createClient } from '@supabase/supabase-js'

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function verifyAdmin(): Promise<boolean> {
  const jar = await cookies()
  const token = jar.get(ADMIN_AUTH_COOKIE)?.value
  if (!token) return false
  const user = await getUserFromAccessToken(token)
  return !!(user && isAdminEmail(user.email))
}

// ─── POST /api/admin/parse-pdfs ───────────────────────────────────────────────

export async function POST() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Serverkonfigurationsfehler: Umgebungsvariablen fehlen.' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // PDF directory: public/pdfs  (available at build time on the server)
  const pdfDir = path.join(process.cwd(), 'public', 'pdfs')

  let recipes
  try {
    recipes = await parseAllPdfsInDir(pdfDir)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `PDF-Parsing fehlgeschlagen: ${msg}` }, { status: 500 })
  }

  if (recipes.length === 0) {
    return NextResponse.json({ inserted: 0, message: 'Keine Rezepte gefunden.' })
  }

  const roundOrNull = (v: number | null) => (v == null ? null : Math.round(v))

  // Upsert into `recipes` table (conflict on name + source_pdf)
  const rows = recipes.map(r => ({
    name:           r.name,
    ingredients:    r.ingredients,              // JSONB
    instructions:   r.instructions,
    total_calories: roundOrNull(r.total_calories),  // INT column → must be whole number
    protein_g:      r.protein_g,
    carbs_g:        r.carbs_g,
    fat_g:          r.fat_g,
    servings:       r.servings,
    source_pdf:     r.source_pdf,
  }))

  const { error, count } = await supabase
    .from('recipes')
    .upsert(rows, { onConflict: 'name,source_pdf', count: 'exact' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ inserted: count ?? rows.length, total_parsed: recipes.length })
}
