export const ADMIN_EMAIL = 'fadhel.alshadood@gmail.com'
export const ADMIN_AUTH_COOKIE = 'fitcoach_admin_access_token'

export const normalizeEmail = (email?: string | null) =>
  email?.trim().toLowerCase() ?? ''

export const isAdminEmail = (email?: string | null) =>
  normalizeEmail(email) === ADMIN_EMAIL

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(base64, 'base64').toString('utf-8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function getEmailFromJwt(token: string): string | null {
  const p = parseJwt(token)
  return typeof p?.email === 'string' ? p.email : null
}

export function getUserIdFromJwt(token: string): string | null {
  const p = parseJwt(token)
  return typeof p?.sub === 'string' ? p.sub : null
}

export interface SupabaseUser {
  id: string
  email: string
}

/**
 * Validate a Supabase access token by calling the /auth/v1/user endpoint.
 * Returns the user object on success, or null if invalid/expired.
 */
export async function getUserFromAccessToken(token: string): Promise<SupabaseUser | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
    })
    if (!res.ok) return null
    const data = await res.json() as { id?: string; email?: string }
    if (!data.id || !data.email) return null
    return { id: data.id, email: data.email }
  } catch {
    return null
  }
}
