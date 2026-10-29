import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { GET as callbackGet } from '../app/auth/callback/route.ts'
import { POST as sessionPost } from '../app/api/auth/session/route.ts'
import { GET as historyGet } from '../app/api/history/route.ts'
import { allowlistedOriginFromRequest } from '../lib/creem.ts'

const originalFetch = globalThis.fetch
const originalUrl = process.env.SUPABASE_URL
const originalAnon = process.env.SUPABASE_ANON_KEY
const originalVercelEnv = process.env.VERCEL_ENV
const originalVercelUrl = process.env.VERCEL_URL
const PREVIEW_HOST = 'ezcoverletter-git-billing-team.vercel.app'

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = originalUrl
  if (originalAnon === undefined) delete process.env.SUPABASE_ANON_KEY
  else process.env.SUPABASE_ANON_KEY = originalAnon
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercelEnv
  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL
  else process.env.VERCEL_URL = originalVercelUrl
})

function originFor(host: string, proto: 'http' | 'https') {
  return allowlistedOriginFromRequest(
    new Request(`${proto}://${host}/auth/callback`, {
      headers: { host, 'x-forwarded-proto': proto },
    }),
  )
}

test('a callback without a code keeps the implicit email link in the browser', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  const response = await callbackGet(new Request('https://www.ezcoverletter.xyz/auth/callback'))
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /text\/html/)
  assert.match(body, /access_token/)
  assert.match(body, /\/api\/auth\/session/)
  assert.equal(body.includes('eyJ'), false)
})

test('an auth error on the callback explains that the link was not accepted', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  const response = await callbackGet(new Request('https://www.ezcoverletter.xyz/auth/callback?error=access_denied&error_description=expired'))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'https://www.ezcoverletter.xyz/login?error=link')
})

test('an invalid token hash does not create a session', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid', error_code: 'otp_expired' }), { status: 403 })
  const response = await callbackGet(new Request('https://www.ezcoverletter.xyz/auth/callback?token_hash=not-a-real-token&type=signup'))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'https://www.ezcoverletter.xyz/login?error=link')
  assert.equal(response.headers.get('set-cookie'), null)
})

test('a forged session token is rejected and is not echoed', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  globalThis.fetch = async () => { throw new Error('network') }
  const token = 'forged-access-token'
  const response = await sessionPost(new Request('https://www.ezcoverletter.xyz/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: token, refresh_token: 'forged-refresh-token' }),
  }))
  const body = await response.text()
  assert.equal(response.status, 401)
  assert.equal(body.includes(token), false)
})

test('history stays closed without a session', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  globalThis.fetch = async () => { throw new Error('network') }
  const response = await historyGet(new Request('https://www.ezcoverletter.xyz/api/history'))
  assert.equal(response.status, 401)
})

test('production domains and localhost stay allowlisted', () => {
  delete process.env.VERCEL_ENV
  delete process.env.VERCEL_URL
  assert.equal(originFor('www.ezcoverletter.xyz', 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor('ezcoverletter.xyz', 'https'), 'https://ezcoverletter.xyz')
  assert.equal(originFor('localhost:3000', 'http'), 'http://localhost:3000')
  assert.equal(originFor('127.0.0.1:3000', 'http'), 'http://127.0.0.1:3000')
})

test('the current preview deployment origin is allowlisted', () => {
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_URL = PREVIEW_HOST
  assert.equal(originFor(PREVIEW_HOST, 'https'), `https://${PREVIEW_HOST}`)
  assert.equal(originFor('www.ezcoverletter.xyz', 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor('localhost:3000', 'http'), 'http://localhost:3000')
})

test('other preview and external hosts are rejected', () => {
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_URL = PREVIEW_HOST
  assert.equal(originFor('other-project.vercel.app', 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor('evil.example', 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor(PREVIEW_HOST, 'http'), 'https://www.ezcoverletter.xyz')
  process.env.VERCEL_URL = 'https://evil.example'
  assert.equal(originFor('evil.example', 'https'), 'https://www.ezcoverletter.xyz')
  process.env.VERCEL_URL = '*.vercel.app'
  assert.equal(originFor('anything.vercel.app', 'https'), 'https://www.ezcoverletter.xyz')
})

test('production does not accept a preview origin', () => {
  process.env.VERCEL_ENV = 'production'
  process.env.VERCEL_URL = PREVIEW_HOST
  assert.equal(originFor(PREVIEW_HOST, 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor('www.ezcoverletter.xyz', 'https'), 'https://www.ezcoverletter.xyz')
})

test('preview login callback stays on that exact deployment', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_URL = PREVIEW_HOST
  const response = await callbackGet(
    new Request(`https://${PREVIEW_HOST}/auth/callback?error=access_denied&next=https://evil.example`, {
      headers: { host: PREVIEW_HOST, 'x-forwarded-proto': 'https' },
    }),
  )
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), `https://${PREVIEW_HOST}/login?error=link`)
})

test('preview login callback rejects a different vercel.app host', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_URL = PREVIEW_HOST
  const response = await callbackGet(
    new Request('https://other-project.vercel.app/auth/callback?error=access_denied', {
      headers: { host: 'other-project.vercel.app', 'x-forwarded-proto': 'https' },
    }),
  )
  assert.equal(response.headers.get('location'), 'https://www.ezcoverletter.xyz/login?error=link')
})

test('production login callback ignores a preview hostname', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.VERCEL_ENV = 'production'
  process.env.VERCEL_URL = PREVIEW_HOST
  const response = await callbackGet(
    new Request(`https://${PREVIEW_HOST}/auth/callback?error=access_denied`, {
      headers: { host: PREVIEW_HOST, 'x-forwarded-proto': 'https' },
    }),
  )
  assert.equal(response.headers.get('location'), 'https://www.ezcoverletter.xyz/login?error=link')
})
