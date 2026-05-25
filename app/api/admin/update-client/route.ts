import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, getEmailFromJwt, getUserIdFromJwt, isAdminEmail } from '@/lib/admin'

const badRequest = (message: string) => NextResponse.json({ ok: false, error: message }, { status: 400 })
const unauthorized = (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status })

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
  if (!token) return unauthorized('Nicht autorisiert.', 401)

  const adminEmail = getEmailFromJwt(token)
  if (!isAdminEmail(adminEmail)) return unauthorized('Kein Zugriff.', 403)

  const adminId = getUserIdFromJwt(token)
  if (!adminId) return unauthorized('Ungültiger Token.', 401)

  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: unknown
        full_name?: unknown
        email?: unknown
        phone?: unknown
        notes?: unknown
      }
    | null

  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''

  if (!clientId) return badRequest('Ungültige Anfrage.')
  if (!fullName) return badRequest('Name ist erforderlich.')
  if (!email) return badRequest('E-Mail ist erforderlich.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Bitte eine gültige E-Mail-Adresse angeben.')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Server-Konfigurationsfehler.' }, { status: 500 })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, trainer_id, user_id, email')
    .eq('id', clientId)
    .eq('trainer_id', adminId)
    .maybeSingle()

  if (clientError) return NextResponse.json({ ok: false, error: clientError.message }, { status: 400 })
  if (!client) return NextResponse.json({ ok: false, error: 'Kunde nicht gefunden.' }, { status: 404 })

  const updatePayload: { full_name: string; phone: string | null; notes: string | null; email?: string } = {
    full_name: fullName,
    phone: phone || null,
    notes: notes || null,
  }

  const canUpdateEmail = !client.user_id
  if (canUpdateEmail) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('trainer_id', adminId)
      .eq('email', email)
      .neq('id', clientId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ ok: false, error: 'E-Mail konnte nicht geprüft werden.' }, { status: 500 })
    }
    if (existing) {
      return badRequest('Diese E-Mail wird bereits von einem anderen Kunden verwendet.')
    }

    updatePayload.email = email
  } else if (email !== client.email) {
    return badRequest('E-Mail kann nur geändert werden, solange der Kunde noch keinen App-Zugang hat.')
  }

  const { error: updateError } = await supabaseAdmin
    .from('clients')
    .update(updatePayload)
    .eq('id', clientId)
    .eq('trainer_id', adminId)

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
