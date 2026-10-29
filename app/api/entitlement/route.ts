import { entitlementFromRequest, noStoreJson } from '@/lib/entitlement'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const claims = entitlementFromRequest(req)
  return noStoreJson({ entitled: claims !== null })
}
