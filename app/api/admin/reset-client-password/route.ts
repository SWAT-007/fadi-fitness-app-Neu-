import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, getEmailFromJwt, getUserIdFromJwt, isAdminEmail } from '@/lib/admin'

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status })

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
  if (!token) return fail('Nicht autorisiert.', 401)

  const adminEmail = getEmailFromJwt(token)
  if (!isAdminEmail(adminEmail)) return fail('Kein Zugriff.', 403)

  const adminId = getUserIdFromJwt(token)
  if (!adminId) return fail('Ungültiger Token.', 401)

  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: unknown
        password?: unknown
        confirmPassword?: unknown
      }
    | null

  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : ''

  if (!clientId) return fail('Ungültige Anfrage.', 400)
  if (!password || !confirmPassword) return fail('Passwort und Bestätigung sind erforderlich.', 400)
  if (password.length < 6) return fail('Passwort muss mindestens 6 Zeichen lang sein.', 400)
  if (password !== confirmPassword) return fail('Passwörter stimmen nicht überein.', 400)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return fail('Server-Konfigurationsfehler.', 500)

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, user_id')
    .eq('id', clientId)
    .eq('trainer_id', adminId)
    .maybeSingle()

  if (clientError) return fail(clientError.message, 400)
  if (!client) return fail('Kunde nicht gefunden.', 404)
  if (!client.user_id) return fail('Für diesen Kunden besteht noch kein App-Zugang.', 400)

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', client.user_id)
    .maybeSingle()

  if (profileError) return fail('Profil konnte nicht geprüft werden.', 500)
  const role = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : ''
  if (role !== 'client') return fail('Passwort kann nur für Kunden zurückgesetzt werden.', 403)

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(client.user_id, {
    password,
  })
  if (updateError) return fail(updateError.message, 400)

  return NextResponse.json({ ok: true })
}
