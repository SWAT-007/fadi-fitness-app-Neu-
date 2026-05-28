import { proxyBackendJson } from '@/app/api/backend/_lib/proxy'

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!id) {
    return Response.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  return proxyBackendJson({
    method: 'PATCH',
    path: `/api/v1/notifications/${id}/read`,
  })
}
