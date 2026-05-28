import { proxyBackendJson } from '@/app/api/backend/_lib/proxy'

export async function PATCH() {
  return proxyBackendJson({
    method: 'PATCH',
    path: '/api/v1/notifications/read-all',
  })
}
