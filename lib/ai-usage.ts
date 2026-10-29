import { jsonFailure } from '@/lib/deepseek-json'
import { beginAiUsage, type UsageMeta } from '@/lib/billing/runtime'
import type { CreditAction } from '@/lib/plans'

export function withCookies(response: Response, cookies: string[]) {
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie)
  return response
}

export async function runMeteredJson(req: Request, action: CreditAction, meta: UsageMeta, work: () => Promise<unknown>) {
  const started = await beginAiUsage(req, action, meta)
  if (!started.ok) {
    return withCookies(Response.json({ error: started.error, code: started.code }, { status: started.status }), started.cookies)
  }
  if (started.replay !== undefined) return withCookies(Response.json(started.replay), started.cookies)

  try {
    const result = await work()
    if (result instanceof Response) {
      if (result.status >= 400) await started.refund()
      else await started.commit(null)
      return withCookies(result, started.cookies)
    }
    await started.commit(result)
    return withCookies(Response.json(result), started.cookies)
  } catch (error) {
    await started.refund()
    return withCookies(jsonFailure(error), started.cookies)
  }
}

export function usageTextResponse(error: string, status: number, cookies: string[]) {
  return withCookies(new Response(error, { status, headers: { 'Cache-Control': 'no-store' } }), cookies)
}
