import { InviteAcceptanceClient } from './InviteAcceptanceClient'

export default async function InvitePage(
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params

  return <InviteAcceptanceClient token={token} />
}
