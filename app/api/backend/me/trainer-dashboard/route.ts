import { proxyBackendJson } from '@/app/api/backend/_lib/proxy'

export async function GET() {
  return proxyBackendJson({
    method: 'GET',
    path: '/api/v1/me/trainer-dashboard',
  })
}
