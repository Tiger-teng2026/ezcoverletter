import { accountSnapshot } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'
import { PRO_EXPORT } from '@/lib/plans'

export async function GET(req: Request) {
  const account = await accountSnapshot(req)
  if (!account.ok) return withCookies(Response.json({ error: account.error }, { status: account.status }), account.cookies ?? [])
  const { userId: _userId, ...publicSnapshot } = account.snapshot
  return withCookies(
    Response.json({
      ...publicSnapshot,
      exportName: PRO_EXPORT.name,
      exportPriceUsd: PRO_EXPORT.priceUsd,
      exportSeparate: false,
    }),
    account.cookies,
  )
}

export async function POST() {
  return Response.json({ error: 'Plan changes come from Creem, not from this request.' }, { status: 405 })
}
