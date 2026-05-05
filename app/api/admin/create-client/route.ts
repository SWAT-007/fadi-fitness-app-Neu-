import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, isAdminEmail, getEmailFromJwt, getUserIdFromJwt } from '@/lib/admin'

export async function POST(request: NextRequest) {
  // ── Auth check: verify admin cookie ─────────────────────────────────────
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  const adminEmail = getEmailFromJwt(token)
  if (!isAdminEmail(adminEmail)) {
    return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 })
  }

  const adminId = getUserIdFromJwt(token)
  if (!adminId) {
    return NextResponse.json({ error: 'Ungültiger Token.' }, { status: 401 })
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null) as {
    full_name?: unknown
    email?: unknown
    password?: unknown
    phone?: unknown
  } | null

  const full_name = typeof body?.full_name === 'string' ? body.full_name.trim() : ''
  const email     = typeof body?.email    === 'string' ? body.email.trim().toLowerCase() : ''
  const password  = typeof body?.password === 'string' ? body.password : ''
  const phone     = typeof body?.phone    === 'string' ? body.phone.trim() : ''

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Name, E-Mail und Passwort sind erforderlich.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Passwort muss mindestens 6 Zeichen lang sein.' }, { status: 400 })
  }

  // ── Supabase Admin-Client (service role key, server-side only) ───────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[create-client] Missing env vars:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
    })
    return NextResponse.json(
      { error: 'Server-Konfigurationsfehler: Umgebungsvariablen fehlen. Bitte SUPABASE_SERVICE_ROLE_KEY in Vercel hinzufügen.' },
      { status: 500 }
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Create auth user ─────────────────────────────────────────────────────
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,           // kein Bestätigungs-E-Mail erforderlich
    user_metadata: { full_name, role: 'client' },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const newUserId = authData.user.id

  // ── Create profile ───────────────────────────────────────────────────────
  await supabaseAdmin.from('profiles').upsert({
    id: newUserId,
    email,
    full_name,
    role: 'client',
  })

  // ── Create client record ─────────────────────────────────────────────────
  const { data: clientData, error: clientError } = await supabaseAdmin
    .from('clients')
    .insert({
      trainer_id: adminId,
      user_id:    newUserId,
      full_name,
      email,
      phone: phone || null,
    })
    .select('id')
    .single()

  if (clientError) {
    // Rollback: Auth-User löschen damit keine verwaisten Accounts entstehen
    await supabaseAdmin.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: clientError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, clientId: clientData.id })
}
