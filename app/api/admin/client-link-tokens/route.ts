import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from '../../../../server/src/db'
import { ADMIN_AUTH_COOKIE, getUserFromAccessToken, normalizeEmail, isAdminEmail } from '@/lib/admin'

const backendBaseUrl = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const errorResponse = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

export async function POST(request: NextRequest) {
  try {
    const adminAccessToken = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
    if (!adminAccessToken) {
      return errorResponse('Nicht autorisiert.', 401)
    }

    const adminUser = await getUserFromAccessToken(adminAccessToken)
    if (!adminUser || !isAdminEmail(adminUser.email)) {
      return errorResponse('Kein Zugriff.', 403)
    }

    const body = await request.json().catch(() => null) as { email?: unknown } | null
    const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '')
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('Ungültige E-Mail-Adresse.', 400)
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return errorResponse('Server-Konfigurationsfehler.', 500)
    }

    const trainerUser = await prisma.user.findUnique({
      where: { email: normalizeEmail(adminUser.email) },
      select: {
        id: true,
        role: true,
        trainerProfile: { select: { id: true } },
      },
    })

    if (!trainerUser || trainerUser.role !== 'TRAINER' || !trainerUser.trainerProfile) {
      return errorResponse('Für diesen Admin existiert noch kein Backend-Trainerkonto.', 409)
    }

    const trainerJwt = jwt.sign(
      { sub: trainerUser.id, role: 'trainer' },
      jwtSecret,
      { expiresIn: '7d' },
    )

    const response = await fetch(`${backendBaseUrl}/api/v1/client-link-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${trainerJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => null) as
      | { token?: unknown; expiresAt?: unknown; message?: unknown }
      | null

    if (!response.ok) {
      const message = typeof payload?.message === 'string'
        ? payload.message
        : 'Einladungslink konnte nicht erstellt werden.'
      return errorResponse(message, response.status)
    }

    if (typeof payload?.token !== 'string' || typeof payload?.expiresAt !== 'string') {
      return errorResponse('Ungültige Antwort vom Backend.', 500)
    }

    return NextResponse.json({
      token: payload.token,
      expiresAt: payload.expiresAt,
    })
  } catch (error) {
    console.error('[admin/client-link-tokens] error:', error)
    return errorResponse('Interner Serverfehler.', 500)
  }
}
