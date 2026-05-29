import { NextRequest, NextResponse } from 'next/server'
import {
  createProxyErrorId,
  getBackendToken,
  parseBackendJsonResponse,
} from '@/app/api/backend/_lib/proxy'

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function GET(request: NextRequest) {
  try {
    const token = await getBackendToken()
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.toString()
    const path = '/api/v1/me/messages'

    const backendResponse = await fetch(
      `${BACKEND_API_URL}${path}${query ? `?${query}` : ''}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    )
    const payload = await parseBackendJsonResponse(backendResponse, { method: 'GET', path })
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:me:messages:get]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getBackendToken()
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown = null
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid request body' }, { status: 400 })
    }

    const path = '/api/v1/me/messages'
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payload = await parseBackendJsonResponse(backendResponse, { method: 'POST', path })
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:me:messages:post]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
