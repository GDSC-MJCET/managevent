import crypto from 'node:crypto'
import { env } from '../../src/config/env.js'

export function createTestJwt(userId: string, role: 'student' | 'club_admin' | 'super_admin' = 'club_admin'): string {
  const secret = env.JWT_SECRET || 'managevent-dev-fallback-secret-minimum-32-chars!'
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: userId, role })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}
