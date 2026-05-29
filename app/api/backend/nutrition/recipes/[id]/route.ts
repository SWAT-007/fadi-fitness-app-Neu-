import { NextRequest, NextResponse } from 'next/server'
import {
  createProxyErrorId,
  getBackendToken,
  parseBackendJsonResponse,
} from '@/app/api/backend/_lib/proxy'

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = await getBackendToken()
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 })
    }

    let body: unknown = null
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid request body' }, { status: 400 })
    }

    const path = `/api/v1/nutrition/recipes/${id}`
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payload = await parseBackendJsonResponse(backendResponse, { method: 'PATCH', path })
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:nutrition:recipes:patch]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = await getBackendToken()
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 })
    }

    const path = `/api/v1/nutrition/recipes/${id}`
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await parseBackendJsonResponse(backendResponse, { method: 'DELETE', path })
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:nutrition:recipes:delete]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
