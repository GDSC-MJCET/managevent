import crypto from 'node:crypto'
import { env } from '../../../config/env.js'
import type { AuthUser } from '../../../middleware/auth.js'

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60

// Dev-only fallback so local runs without JWT_SECRET still work end to end.
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-0123456789'

function getJwtSecret(): string {
  if (env.JWT_SECRET) return env.JWT_SECRET
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production')
  }
  return DEV_JWT_SECRET
}

/**
 * Signs the app's JWT in the exact shape middleware.verifyJwtToken validates:
 * HS256, base64url segments, payload `{ sub, role, exp }`, 7-day lifetime.
 */
export function createJwt(user: Pick<AuthUser, 'id' | 'role'>): string {
  const secret = getJwtSecret()

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payloadB64 = Buffer.from(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS_SEC,
    }),
  ).toString('base64url')

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payloadB64}`)
    .digest('base64url')

  return `${header}.${payloadB64}.${signature}`
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function createResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000
