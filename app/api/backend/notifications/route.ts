import { NextRequest } from 'next/server'
import { proxyBackendJson } from '@/app/api/backend/_lib/proxy'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  return proxyBackendJson({
    method: 'GET',
    path: `/api/v1/notifications${query ? `?${query}` : ''}`,
  })
}
