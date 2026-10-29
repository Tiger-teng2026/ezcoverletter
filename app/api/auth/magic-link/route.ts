import { allowlistedOriginFromRequest } from '@/lib/creem'
import { SIGN_IN_UNAVAILABLE } from '@/lib/plans'
import { supabaseAuthClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const client = supabaseAuthClient()
  if (!client) return Response.json({ error: SIGN_IN_UNAVAILABLE }, { status: 503 })
  const body = await req.json().catch(() => null)
  const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string' ? body.email.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${allowlistedOriginFromRequest(req)}/auth/callback` },
  })
  if (error) return signInFailure(error)
  return Response.json({ ok: true })
}

function signInFailure(error: { status?: number; code?: string; message?: string }) {
  const code = error.code || ''
  const status = error.status || 0
  console.error('[auth] magic link was not sent', { status, code })
  if (code === 'over_request_rate_limit') {
    return Response.json({ error: 'Wait a minute before requesting another sign-in email.' }, { status: 429 })
  }
  if (code === 'over_email_send_rate_limit' || status === 429) {
    return Response.json(
      {
        error:
          'The email service received too many sign-in requests. Wait about an hour, then try once. Also check the inbox and spam folder for the earlier message.',
      },
      { status: 429 },
    )
  }
  if (code === 'email_address_not_authorized') {
    return Response.json(
      {
        error:
          'Supabase’s built-in mailer can only send to an organization team address. Add that address to the team, or set up custom SMTP under Authentication → Emails.',
      },
      { status: 403 },
    )
  }
  if (code === 'email_address_invalid') {
    return Response.json({ error: 'Enter a real email address. The email service rejected this one.' }, { status: 400 })
  }
  return Response.json({ error: 'The sign-in email could not be sent.' }, { status: 502 })
}
