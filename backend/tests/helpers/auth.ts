import crypto from 'node:crypto'
import { env } from '../../src/config/env.js'

export interface TestJwtOptions {
  exp?: number
  alg?: string
  typ?: string
  secret?: string
  extraClaims?: Record<string, unknown>
}

export function createTestJwt(
  userId: string,
  role: 'student' | 'club_admin' | 'super_admin' = 'club_admin',
  options: TestJwtOptions = {},
): string {
  const secret = options.secret ?? env.JWT_SECRET ?? 'managevent-test-secret-at-least-32-chars-long!'
  const alg = options.alg ?? 'HS256'
  const typ = options.typ ?? 'JWT'

  const header = Buffer.from(JSON.stringify({ alg, typ })).toString('base64url')

  const nowSec = Math.floor(Date.now() / 1000)
  // Default to 7 days lifetime per project README
  const exp = options.exp ?? nowSec + 7 * 24 * 60 * 60

  const payload: Record<string, unknown> = {
    sub: userId,
    role,
    exp,
    ...options.extraClaims,
  }

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payloadB64}`).digest('base64url')

  return `${header}.${payloadB64}.${sig}`
}
