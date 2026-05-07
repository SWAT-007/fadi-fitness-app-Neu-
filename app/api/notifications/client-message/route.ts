import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserFromAccessToken } from '@/lib/admin'

const notificationError = (message: string, status = 500) =>
  NextResponse.json({ ok: false, message }, { status })

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''

  if (!accessToken) return notificationError('Zugriffstoken fehlt.', 401)

  const user = await getUserFromAccessToken(accessToken)
  if (!user) return notificationError('Sitzung ist ungültig oder abgelaufen.', 401)

  const body = await request.json().catch(() => null) as { content?: unknown } | null
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return notificationError('Nachricht fehlt.', 400)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return notificationError('Supabase Server-Konfiguration fehlt.')
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, full_name, user_id, trainer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (clientError) return notificationError(clientError.message)
  if (!client?.trainer_id) return notificationError('Kein Trainer für diesen Client gefunden.', 403)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const senderName = profile?.full_name || client.full_name || 'Ein Kunde'
  const notification = {
    client_id: client.trainer_id,
    type: 'message',
    title: `${senderName} hat dir eine Nachricht geschickt`,
    body: content.slice(0, 60),
    is_read: false,
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('notifications')
    .insert(notification)
    .select('id, client_id')
    .single()

  if (insertError) return notificationError(insertError.message)

  return NextResponse.json({
    ok: true,
    notificationId: inserted.id,
    insertedClientId: inserted.client_id,
    trainerAuthUserId: client.trainer_id,
    clientAuthUserId: user.id,
    clientRowId: client.id,
    insertedTrainerUserId: inserted.client_id === client.trainer_id,
    insertedClientOwnId: inserted.client_id === user.id,
  })
}
