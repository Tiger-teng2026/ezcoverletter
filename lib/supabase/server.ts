import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function readSupabaseAuth() {
  const url = process.env.SUPABASE_URL?.trim() || ''
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || ''
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function readSupabaseService() {
  const url = process.env.SUPABASE_URL?.trim() || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!url || !serviceRoleKey) return null
  return { url, serviceRoleKey }
}

export function parseCookieHeader(header: string | null) {
  if (!header) return [] as { name: string; value: string }[]
  return header.split(';').flatMap((part) => {
    const separator = part.indexOf('=')
    if (separator <= 0) return []
    const name = part.slice(0, separator).trim()
    const raw = part.slice(separator + 1).trim()
    try {
      return [{ name, value: decodeURIComponent(raw) }]
    } catch {
      return [{ name, value: raw }]
    }
  })
}

export function serializeCookie(
  name: string,
  value: string,
  options: { path?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string | boolean; expires?: Date } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`]
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  const sameSite = options.sameSite === true ? 'Strict' : options.sameSite || 'Lax'
  if (typeof sameSite === 'string') parts.push(`SameSite=${sameSite}`)
  return parts.join('; ')
}

export function createRequestAuthClient(req: Request) {
  const config = readSupabaseAuth()
  if (!config) return null
  const cookies: string[] = []
  const client = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.get('cookie'))
      },
      setAll(next) {
        for (const cookie of next) cookies.push(serializeCookie(cookie.name, cookie.value, cookie.options))
      },
    },
  })
  return { client, cookies }
}

export async function userFromRequest(req: Request) {
  const auth = createRequestAuthClient(req)
  if (!auth) return null
  const { data, error } = await auth.client.auth.getUser()
  if (error || !data.user) return null
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    cookies: auth.cookies,
    client: auth.client as SupabaseClient,
  }
}

type SavedGeneration = {
  id: string
  userId: string
  tool: string
  title: string
  input: unknown
  output: unknown
  createdAt: string
}

function mapGeneration(row: Record<string, unknown>): SavedGeneration {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tool: String(row.tool),
    title: String(row.title),
    input: row.input,
    output: row.output,
    createdAt: String(row.created_at),
  }
}

/** Reads go through the signed-in JWT so generations RLS (user_id = auth.uid()) applies. */
export async function selectOwnGenerations(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('generations')
    .select('id, user_id, tool, title, input, output, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return null
  return (data ?? []).map((row) => mapGeneration(row as Record<string, unknown>))
}

export async function selectOwnGeneration(client: SupabaseClient, userId: string, id: string) {
  const { data, error } = await client
    .from('generations')
    .select('id, user_id, tool, title, input, output, created_at')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) return null
  return data ? mapGeneration(data as Record<string, unknown>) : undefined
}

export async function deleteOwnGeneration(client: SupabaseClient, userId: string, id: string) {
  const { data, error } = await client.from('generations').delete().eq('user_id', userId).eq('id', id).select('id')
  if (error) return null
  return Array.isArray(data) && data.length > 0
}

export function supabaseAuthClient() {
  const config = readSupabaseAuth()
  if (!config) return null
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function supabaseServiceClient() {
  const config = readSupabaseService()
  if (!config) return null
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
