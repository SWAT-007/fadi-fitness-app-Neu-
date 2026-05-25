import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, getEmailFromJwt, getUserIdFromJwt, isAdminEmail } from '@/lib/admin'

const EMAIL_IN_USE_MESSAGE = 'E-Mail ist bereits vergeben.'

const isEmailAlreadyRegisteredError = (message: string) => {
  const text = message.toLowerCase()
  return (
    text.includes('already been registered') ||
    text.includes('already registered') ||
    text.includes('already exists')
  )
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as
    | {
        full_name?: unknown
        email?: unknown
        password?: unknown
        phone?: unknown
      }
    | null

  const full_name = typeof body?.full_name === 'string' ? body.full_name.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Name, E-Mail und Passwort sind erforderlich.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Passwort muss mindestens 6 Zeichen lang sein.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[create-client] Missing env vars:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
    })
    return NextResponse.json({ error: 'Server-Konfigurationsfehler: Umgebungsvariablen fehlen.' }, { status: 500 })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const findAuthUserByEmail = async (targetEmail: string) => {
    let page = 1
    const perPage = 200
    while (page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error) return { user: null, error }
      const users = data?.users ?? []
      const user = users.find((u) => (u.email ?? '').toLowerCase() === targetEmail)
      if (user) return { user, error: null as null }
      if (users.length < perPage) break
      page += 1
    }
    return { user: null, error: null as null }
  }

  let userId = ''
  let createdAuthUser = false

  const { data: createdUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'client' },
  })

  if (!createUserError && createdUserData.user?.id) {
    userId = createdUserData.user.id
    createdAuthUser = true
  } else if (createUserError && isEmailAlreadyRegisteredError(createUserError.message)) {
    const { user: existingUser, error: listUsersError } = await findAuthUserByEmail(email)
    if (listUsersError || !existingUser?.id) {
      return NextResponse.json({ error: EMAIL_IN_USE_MESSAGE }, { status: 400 })
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', existingUser.id)
      .maybeSingle()

    const existingRole =
      typeof existingProfile?.role === 'string' ? existingProfile.role.trim().toLowerCase() : null

    if (existingRole && existingRole !== 'client') {
      return NextResponse.json({ error: EMAIL_IN_USE_MESSAGE }, { status: 400 })
    }

    const { count: clientCount, error: clientCountError } = await supabaseAdmin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', existingUser.id)

    if (clientCountError) {
      return NextResponse.json({ error: 'Client-Prüfung fehlgeschlagen.' }, { status: 500 })
    }
    if ((clientCount ?? 0) > 0) {
      return NextResponse.json({ error: EMAIL_IN_USE_MESSAGE }, { status: 400 })
    }

    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name, role: 'client' },
    })
    if (updateUserError) {
      return NextResponse.json({ error: 'Client-Account konnte nicht vorbereitet werden.' }, { status: 500 })
    }

    userId = existingUser.id
  } else {
    return NextResponse.json(
      { error: createUserError?.message ?? 'Client konnte nicht erstellt werden.' },
      { status: 400 }
    )
  }

  await supabaseAdmin.from('profiles').upsert({
    id: userId,
    email,
    full_name,
    role: 'client',
  })

  const { data: clientData, error: clientError } = await supabaseAdmin
    .from('clients')
    .insert({
      trainer_id: adminId,
      user_id: userId,
      full_name,
      email,
      phone: phone || null,
    })
    .select('id')
    .single()

  if (clientError) {
    if (createdAuthUser) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
    }
    return NextResponse.json({ error: clientError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, clientId: clientData.id })
}
