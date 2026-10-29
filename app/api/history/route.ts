import { historyFor } from '@/lib/billing/runtime'
import { withCookies } from '@/lib/ai-usage'

export async function GET(req: Request) {
  const result = await historyFor(req)
  const cookies = 'cookies' in result ? result.cookies : []
  if (!result.ok || !('rows' in result) || !result.rows) {
    return withCookies(Response.json({ error: 'error' in result ? result.error : 'Sign in to view saved results.' }, { status: 'status' in result ? result.status : 401 }), cookies)
  }
  return withCookies(Response.json({
    rows: result.rows.map((row) => ({ id: row.id, tool: row.tool, title: row.title, createdAt: row.createdAt })),
  }), cookies)
}
