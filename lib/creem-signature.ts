import { createHmac, timingSafeEqual } from 'node:crypto'

/** Creem signs the raw body with HMAC-SHA256 and sends the hex digest in `creem-signature`. */
export function creemSignatureHex(rawBody: string, secret: string) {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function verifyCreemSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false
  const expected = creemSignatureHex(rawBody, secret)
  const actual = signature.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(actual) || actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}
