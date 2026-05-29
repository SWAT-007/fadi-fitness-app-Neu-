import { NextResponse } from 'next/server'
import {
  createProxyErrorId,
  getBackendToken,
  parseBackendJsonResponse,
} from '@/app/api/backend/_lib/proxy'

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function POST() {
  try {
    const token = await getBackendToken()
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    const path = '/api/v1/nutrition/recipes/import-pdfs'
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await parseBackendJsonResponse(backendResponse, { method: 'POST', path })
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:nutrition:recipes:import-pdfs]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
