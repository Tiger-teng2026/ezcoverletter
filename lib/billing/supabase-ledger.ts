import { readCreditRpc, type HistoryRecord, type ReserveResult, type SubscriptionRecord } from '@/lib/billing/ledger'
import { supabaseServiceClient } from '@/lib/supabase/server'

/** Service-role client. Browser code must not import this module. */
export function createSupabaseLedger() {
  const client = supabaseServiceClient()
  if (!client) return null

  return {
    async reserve(input: {
      accountId: string
      period: string
      cost: number
      allowance: number
      action: string
      idempotencyKey?: string
    }): Promise<ReserveResult> {
      const { data, error } = await client.rpc('consume_credits', {
        p_account_id: input.accountId,
        p_period_start: input.period,
        p_cost: input.cost,
        p_allowance: input.allowance,
        p_action: input.action,
        p_idempotency_key: input.idempotencyKey || '',
      })
      const row = error ? null : readCreditRpc(data)
      if (!row) throw new Error('credit reserve failed')
      if (!row.ok) {
        return { ok: false, code: row.code === 'in_progress' || row.code === 'replay_failed' ? row.code : 'quota', remaining: row.remaining ?? 0 }
      }
      if (!row.reservationId) throw new Error('credit reserve failed')
      return {
        ok: true,
        reservationId: String(row.reservationId),
        remaining: row.remaining ?? 0,
        replay: row.replay ? row.output : undefined,
      }
    },
    async refund(reservationId: string) {
      const { error } = await client.rpc('refund_credits', { p_reservation_id: reservationId })
      if (error) throw new Error('credit refund failed')
    },
    async commit(reservationId: string, output: unknown, history?: Omit<HistoryRecord, 'id' | 'createdAt'>) {
      const { error } = await client.rpc('commit_credits', {
        p_reservation_id: reservationId,
        p_output: output ?? null,
        p_user_id: history?.userId ?? null,
        p_tool: history?.tool ?? null,
        p_title: history?.title ?? null,
        p_input: history?.input ?? null,
      })
      if (error) throw new Error('credit commit failed')
    },
    async used(accountId: string, period: string) {
      const { data } = await client.from('credit_balances').select('used').eq('account_id', accountId).eq('period_start', period).maybeSingle()
      return typeof data?.used === 'number' ? data.used : 0
    },
    async markEvent(id: string): Promise<'new' | 'duplicate'> {
      const { error } = await client.from('webhook_events').insert({ id, event_type: 'received' })
      if (error?.code === '23505') return 'duplicate'
      if (error) throw new Error('webhook event failed')
      return 'new'
    },
    async getSubscription(userId: string) {
      const { data } = await client.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
      return data ? mapSubscription(data) : null
    },
    async getSubscriptionByCreemId(creemSubscriptionId: string) {
      const { data } = await client.from('subscriptions').select('*').eq('creem_subscription_id', creemSubscriptionId).maybeSingle()
      return data ? mapSubscription(data) : null
    },
    async saveSubscription(record: SubscriptionRecord) {
      const { error } = await client.from('subscriptions').upsert({
        user_id: record.userId,
        plan: record.plan,
        status: record.status,
        product_id: record.productId,
        creem_subscription_id: record.creemSubscriptionId,
        creem_customer_id: record.creemCustomerId,
        current_period_end: record.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error('subscription save failed')
    },
    async markExport(checkoutId: string, status: 'paid' | 'refunded') {
      const { error } = await client.from('one_time_purchases').upsert({ checkout_id: checkoutId, status })
      if (error) throw new Error('export record failed')
    },
    async isExportRevoked(checkoutId: string) {
      const { data } = await client.from('one_time_purchases').select('status').eq('checkout_id', checkoutId).maybeSingle()
      return data?.status === 'refunded'
    },
  }
}

function mapSubscription(row: Record<string, unknown>): SubscriptionRecord {
  return {
    userId: String(row.user_id),
    plan: row.plan === 'pro' ? 'pro' : 'creator',
    status: row.status as SubscriptionRecord['status'],
    productId: String(row.product_id || ''),
    creemSubscriptionId: String(row.creem_subscription_id || ''),
    creemCustomerId: typeof row.creem_customer_id === 'string' ? row.creem_customer_id : null,
    currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    cycleId: typeof row.cycle_id === 'string' ? row.cycle_id : null,
    periodStart: typeof row.period_start === 'string' ? row.period_start : null,
    openedByTransaction: typeof row.opened_by_transaction === 'string' ? row.opened_by_transaction : null,
    scheduledPlan: row.scheduled_plan === 'creator' || row.scheduled_plan === 'pro' ? row.scheduled_plan : null,
  }
}
