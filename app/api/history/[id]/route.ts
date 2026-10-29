import { deleteHistoryFor, historyFor } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'

type Context = { params: Promise<{ id: string }> }

export async function GET(req: Request, context: Context) {
  const { id } = await context.params
  const result = await historyFor(req, id)
  const cookies = 'cookies' in result ? result.cookies : []
  if (!result.ok) return withCookies(Response.json({ error: result.error }, { status: result.status }), cookies)
  return withCookies(Response.json(result.row), cookies)
}

export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params
  const result = await deleteHistoryFor(req, id)
  const cookies = 'cookies' in result ? result.cookies : []
  if (!result.ok) return withCookies(Response.json({ error: result.error }, { status: result.status }), cookies)
  return withCookies(new Response(null, { status: 204 }), cookies)
}
