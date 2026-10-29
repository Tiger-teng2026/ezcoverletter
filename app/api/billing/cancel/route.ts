import { accountSnapshot, getLedger } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'
import { readCreemConfig } from '@/lib/creem'

export const maxDuration = 30

export async function POST(req: Request) {
  const account = await accountSnapshot(req)
  if (!account.ok) return withCookies(Response.json({ error: account.error }, { status: account.status }), account.cookies ?? [])
  if (!account.snapshot.userId) {
    return withCookies(Response.json({ error: 'Sign in before managing a subscription.' }, { status: 401 }), account.cookies)
  }
  const ledger = getLedger()
  const config = readCreemConfig()
  if (!ledger || !config.ok) {
    return withCookies(Response.json({ error: 'Subscription management is not configured.' }, { status: 503 }), account.cookies)
  }
  const subscription = await ledger.getSubscription(account.snapshot.userId)
  if (!subscription?.creemSubscriptionId) {
    return withCookies(Response.json({ error: 'There is no Creem subscription on this account.' }, { status: 404 }), account.cookies)
  }
  if (!/^sub_[A-Za-z0-9]+$/.test(subscription.creemSubscriptionId)) {
    return withCookies(Response.json({ error: 'The stored subscription id is not valid.' }, { status: 409 }), account.cookies)
  }

  const response = await fetch(`${config.apiBase}/v1/subscriptions/${subscription.creemSubscriptionId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey },
    body: JSON.stringify({ mode: 'scheduled', onExecute: 'cancel' }),
  })
  if (!response.ok) {
    return withCookies(Response.json({ error: 'Creem did not cancel the subscription.' }, { status: 502 }), account.cookies)
  }
  const payload = (await response.json().catch(() => null)) as { status?: string; current_period_end_date?: string } | null
  const status = payload?.status === 'scheduled_cancel' || payload?.status === 'canceled' ? payload.status : null
  if (!status) {
    return withCookies(Response.json({ error: 'Creem did not confirm the cancellation.' }, { status: 502 }), account.cookies)
  }
  const periodEnd = payload?.current_period_end_date && !Number.isNaN(Date.parse(payload.current_period_end_date))
    ? new Date(payload.current_period_end_date).toISOString()
    : subscription.currentPeriodEnd
  await ledger.saveSubscription({ ...subscription, status, currentPeriodEnd: periodEnd })
  return withCookies(Response.json({ ok: true, status, currentPeriodEnd: periodEnd }), account.cookies)
}
