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

export function verifyJwtToken(token: string): AuthUser | null {
  const secret = env.JWT_SECRET || 'managevent-dev-fallback-secret-minimum-32-chars!'
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts
  if (!headerB64 || !payloadB64 || !signatureB64) return null

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  if (expectedSig !== signatureB64) return null

  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson)
    const id = payload.sub || payload.id
    const role = payload.role || 'student'
    if (!id) return null
    return { id, role }
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
    return next(new ApiError('VALIDATION', 'Event ID required'))
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
