import { createHash, randomBytes } from 'crypto'

export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // link is valid for 24 hours
export const VERIFY_RESEND_COOLDOWN_MS = 60 * 1000 // at most one email per minute

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** The raw token goes in the email; only its hash is stored. */
export function newVerificationToken() {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    hash: hashToken(token),
    expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString(),
  }
}