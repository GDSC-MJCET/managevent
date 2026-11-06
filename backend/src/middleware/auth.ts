import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { prisma } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

export interface AuthUser {
  id: string
  role: 'student' | 'club_admin' | 'super_admin'
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const VALID_ROLES = ['student', 'club_admin', 'super_admin'] as const

export function verifyJwtToken(token: string): AuthUser | null {
  const secret = env.JWT_SECRET
  if (!secret) {
    // Secret not configured; refuse all authentication safely
    return null
  }

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts
  if (!headerB64 || !payloadB64 || !signatureB64) return null

  // 1. Verify header
  try {
    const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8')
    const header = JSON.parse(headerJson)
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null
    }
  } catch {
    return null
  }

  // 2. Verify signature safely using timingSafeEqual
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  const expectedBuf = Buffer.from(expectedSig)
  const receivedBuf = Buffer.from(signatureB64)

  if (expectedBuf.length !== receivedBuf.length) {
    return null
  }

  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return null
  }

  // 3. Verify payload claims (sub, role, exp)
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson)

    const sub = payload.sub
    if (typeof sub !== 'string' || !sub.trim()) {
      return null
    }

    const role = payload.role
    if (!VALID_ROLES.includes(role)) {
      return null
    }

    // Expiry check (7-day token contract: exp must be present and valid)
    const exp = payload.exp
    if (typeof exp !== 'number' || !Number.isInteger(exp)) {
      return null
    }

    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec >= exp) {
      // Token is expired (reject when nowSec >= exp)
      return null
    }

    return { id: sub, role }
  } catch {
    return null
  }
}

export function parseOptionalAuth(req: Request): void {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    const user = verifyJwtToken(token)
    if (user) {
      req.user = user
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  const user = verifyJwtToken(token)
  if (!user) {
    return next(new ApiError('UNAUTHENTICATED', 'Invalid or expired token'))
  }

  req.user = user
  next()
}

export function requireRole(...roles: ('student' | 'club_admin' | 'super_admin')[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError('FORBIDDEN', 'Insufficient permissions'))
    }
    next()
  }
}

export async function requireClubOwner(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = req.user
  if (!user) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId
  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(eventId)) {
    return next(new ApiError('VALIDATION', 'Invalid event ID'))
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { club: true },
    })

    if (!event) {
      return next(new ApiError('NOT_FOUND', 'Event not found'))
    }

    if (event.club.ownerId !== user.id) {
      return next(new ApiError('FORBIDDEN', 'Only the club owner can perform this action'))
    }

    next()
  } catch (err) {
    next(err)
  }
}
