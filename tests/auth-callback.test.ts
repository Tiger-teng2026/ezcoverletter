import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { GET as callbackGet } from '../app/auth/callback/route.ts'
import { POST as magicPost } from '../app/api/auth/magic-link/route.ts'
import { POST as sessionPost } from '../app/api/auth/session/route.ts'
import { GET as historyGet } from '../app/api/history/route.ts'
import { allowlistedOriginFromRequest } from '../lib/creem.ts'

const originalFetch = globalThis.fetch
const originalUrl = process.env.SUPABASE_URL
const originalAnon = process.env.SUPABASE_ANON_KEY
const originalVercelEnv = process.env.VERCEL_ENV
const originalVercelUrl = process.env.VERCEL_URL
const originalVercelBranchUrl = process.env.VERCEL_BRANCH_URL
const PREVIEW_HOST = 'my-ceyhwycc0-tiger-teng2026s-projects.vercel.app'
const BRANCH_HOST = 'my-app-git-billing-test-tiger-teng2026s-projects.vercel.app'

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
  if (originalVercelBranchUrl === undefined) delete process.env.VERCEL_BRANCH_URL
  else process.env.VERCEL_BRANCH_URL = originalVercelBranchUrl
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

function usePreview(branch = BRANCH_HOST) {
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_URL = PREVIEW_HOST
  if (branch) process.env.VERCEL_BRANCH_URL = branch
  else delete process.env.VERCEL_BRANCH_URL
}

test('a unique preview host uses the stable branch callback', () => {
  usePreview()
  assert.equal(originFor(PREVIEW_HOST, 'https'), `https://${BRANCH_HOST}`)
  assert.equal(originFor('localhost:3000', 'http'), `https://${BRANCH_HOST}`)
})

test('the stable preview branch keeps its own callback', () => {
  usePreview()
  assert.equal(originFor(BRANCH_HOST, 'https'), `https://${BRANCH_HOST}`)
})

test('a preview without a branch alias uses only the exact deployment host', () => {
  usePreview('')
  assert.equal(originFor(PREVIEW_HOST, 'https'), `https://${PREVIEW_HOST}`)
  assert.equal(originFor('other-project.vercel.app', 'https'), 'https://www.ezcoverletter.xyz')
})

test('other preview and external hosts are rejected', () => {
  usePreview()
  assert.equal(originFor('other-project.vercel.app', 'https'), `https://${BRANCH_HOST}`)
  assert.equal(originFor('evil.example', 'https'), `https://${BRANCH_HOST}`)
  assert.equal(originFor(PREVIEW_HOST, 'http'), `https://${BRANCH_HOST}`)
  process.env.VERCEL_URL = 'https://evil.example'
  process.env.VERCEL_BRANCH_URL = '*.vercel.app'
  assert.equal(originFor('evil.example', 'https'), 'https://www.ezcoverletter.xyz')
  process.env.VERCEL_URL = '*.vercel.app'
  assert.equal(originFor('anything.vercel.app', 'https'), 'https://www.ezcoverletter.xyz')
})

test('production does not accept a preview origin', () => {
  process.env.VERCEL_ENV = 'production'
  process.env.VERCEL_URL = PREVIEW_HOST
  process.env.VERCEL_BRANCH_URL = BRANCH_HOST
  assert.equal(originFor(PREVIEW_HOST, 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor(BRANCH_HOST, 'https'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor('localhost:3000', 'http'), 'https://www.ezcoverletter.xyz')
  assert.equal(originFor('www.ezcoverletter.xyz', 'https'), 'https://www.ezcoverletter.xyz')
})

test('magic link redirect_to uses the stable preview branch', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  usePreview()
  let requested = ''
  globalThis.fetch = async (input) => {
    requested = String(input)
    return Response.json({})
  }
  const response = await magicPost(new Request(`https://${PREVIEW_HOST}/api/auth/magic-link`, {
    method: 'POST',
    headers: {
      host: PREVIEW_HOST,
      'x-forwarded-proto': 'https',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'person@example.com' }),
  }))
  assert.equal(response.status, 200)
  const redirect = decodeURIComponent(requested)
  assert.match(redirect, new RegExp(`https://${BRANCH_HOST}/auth/callback`))
  assert.equal(redirect.includes(PREVIEW_HOST), false)
  assert.equal(redirect.includes('www.ezcoverletter.xyz'), false)
})

test('a verified preview login lands on that preview account', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  usePreview()
  globalThis.fetch = async () => Response.json({
    access_token: 'session-access-token',
    refresh_token: 'session-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1_900_000_000,
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'person@example.com',
      app_metadata: {},
      user_metadata: {},
    },
  })
  const response = await callbackGet(new Request(`https://${PREVIEW_HOST}/auth/callback?token_hash=valid-token&type=email`, {
    headers: { host: PREVIEW_HOST, 'x-forwarded-proto': 'https' },
  }))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), `https://${BRANCH_HOST}/account?welcome=1`)
  assert.match(response.headers.get('set-cookie') || '', /sb-/)
  assert.equal((response.headers.get('location') || '').includes('www.ezcoverletter.xyz'), false)
})

test('a rejected preview login does not create a session', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  usePreview()
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid', error_code: 'otp_expired' }), { status: 403 })
  const response = await callbackGet(new Request(`https://${PREVIEW_HOST}/auth/callback?code=not-a-session`, {
    headers: { host: PREVIEW_HOST, 'x-forwarded-proto': 'https' },
  }))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), `https://${BRANCH_HOST}/login?error=link`)
  assert.equal(response.headers.get('set-cookie'), null)
})

test('production login callback ignores a preview hostname', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.VERCEL_ENV = 'production'
  process.env.VERCEL_URL = PREVIEW_HOST
  process.env.VERCEL_BRANCH_URL = BRANCH_HOST
  const response = await callbackGet(
    new Request(`https://${PREVIEW_HOST}/auth/callback?error=access_denied`, {
      headers: { host: PREVIEW_HOST, 'x-forwarded-proto': 'https' },
    }),
  )
  assert.equal(response.headers.get('location'), 'https://www.ezcoverletter.xyz/login?error=link')
})
