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
