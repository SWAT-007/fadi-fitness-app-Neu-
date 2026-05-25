import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, getEmailFromJwt, getUserIdFromJwt, isAdminEmail } from '@/lib/admin'

const deleteError = (message: string, status: number) =>
  NextResponse.json({ ok: false, error: message }, { status })

const isMissingTableError = (error: { code?: string } | null) => error?.code === '42P01'

const assertDeleteOk = (error: { code?: string; message?: string } | null, fallback: string) => {
  if (!error || isMissingTableError(error)) return null
  return error.message ?? fallback
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
  if (!token) return deleteError('Nicht autorisiert.', 401)

  const adminEmail = getEmailFromJwt(token)
  if (!isAdminEmail(adminEmail)) return deleteError('Kein Zugriff.', 403)

  const adminId = getUserIdFromJwt(token)
  if (!adminId) return deleteError('Ungültiger Token.', 401)

  const body = await request.json().catch(() => null) as { clientId?: unknown } | null
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  if (!clientId) return deleteError('Ungültige Anfrage.', 400)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return deleteError('Server-Konfigurationsfehler: Umgebungsvariablen fehlen.', 500)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id, user_id')
    .eq('id', clientId)
    .eq('trainer_id', adminId)
    .maybeSingle()

  if (clientError) return deleteError(clientError.message, 400)
  if (!client) return deleteError('Kunde nicht gefunden.', 404)

  const { data: checkins, error: checkinsError } = await supabaseAdmin
    .from('weekly_checkins')
    .select('id')
    .eq('client_id', clientId)

  const checkinsErrMessage = assertDeleteOk(checkinsError, 'Check-ins konnten nicht geladen werden.')
  if (checkinsErrMessage) return deleteError(checkinsErrMessage, 500)

  if ((checkins ?? []).length > 0) {
    const checkinIds = (checkins ?? []).map((c) => c.id)
    const { error } = await supabaseAdmin
      .from('checkin_images')
      .delete()
      .in('checkin_id', checkinIds)
    const message = assertDeleteOk(error, 'Check-in-Bilder konnten nicht gelöscht werden.')
    if (message) return deleteError(message, 500)
  }

  const { data: workoutLogs, error: workoutLogsError } = await supabaseAdmin
    .from('workout_logs')
    .select('id')
    .eq('client_id', clientId)

  const logsErrMessage = assertDeleteOk(workoutLogsError, 'Trainingslogs konnten nicht geladen werden.')
  if (logsErrMessage) return deleteError(logsErrMessage, 500)

  if ((workoutLogs ?? []).length > 0) {
    const logIds = (workoutLogs ?? []).map((log) => log.id)
    const { error } = await supabaseAdmin
      .from('exercise_logs')
      .delete()
      .in('workout_log_id', logIds)
    const message = assertDeleteOk(error, 'Satz-Logs konnten nicht gelöscht werden.')
    if (message) return deleteError(message, 500)
  }

  const deleteByClient = async (table: string, errorMessage: string) => {
    const { error } = await supabaseAdmin.from(table).delete().eq('client_id', clientId)
    const message = assertDeleteOk(error, errorMessage)
    if (message) throw new Error(message)
  }

  try {
    await deleteByClient('assigned_plans', 'Zugewiesene Trainingspläne konnten nicht gelöscht werden.')
    await deleteByClient('assigned_nutrition_plans', 'Zugewiesene Ernährungspläne konnten nicht gelöscht werden.')
    await deleteByClient('progress_logs', 'Fortschrittslogs konnten nicht gelöscht werden.')
    await deleteByClient('workout_logs', 'Trainingslogs konnten nicht gelöscht werden.')
    await deleteByClient('weekly_checkins', 'Check-ins konnten nicht gelöscht werden.')
    await deleteByClient('meal_logs', 'Meal-Logs konnten nicht gelöscht werden.')
    await deleteByClient('drink_logs', 'Drink-Logs konnten nicht gelöscht werden.')
    await deleteByClient('meal_history', 'Meal-History konnte nicht gelöscht werden.')
    await deleteByClient('client_meal_foods', 'Meal-Auswahlen konnten nicht gelöscht werden.')
    await deleteByClient('client_food_swaps', 'Food-Swaps konnten nicht gelöscht werden.')
    await deleteByClient('notifications', 'Benachrichtigungen konnten nicht gelöscht werden.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kunde konnte nicht gelöscht werden.'
    return deleteError(message, 500)
  }

  if (client.user_id) {
    const { error: messagesError } = await supabaseAdmin
      .from('messages')
      .delete()
      .or(`sender_id.eq.${client.user_id},receiver_id.eq.${client.user_id}`)

    const messagesErrMessage = assertDeleteOk(messagesError, 'Nachrichten konnten nicht gelöscht werden.')
    if (messagesErrMessage) return deleteError(messagesErrMessage, 500)
  }

  const { error: deleteClientError } = await supabaseAdmin
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('trainer_id', adminId)

  if (deleteClientError) return deleteError(deleteClientError.message, 500)

  return NextResponse.json({ ok: true })
}
