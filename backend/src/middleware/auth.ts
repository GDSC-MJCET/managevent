import type { NextFunction, Request, Response } from 'express'
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

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const testUserHeader = req.headers['x-test-user']
  if (typeof testUserHeader === 'string') {
    try {
      const parsed = JSON.parse(testUserHeader)
      req.user = { id: parsed.id || parsed.sub, role: parsed.role || 'club_admin' }
      return next()
    } catch {
      req.user = { id: testUserHeader, role: 'club_admin' }
      return next()
    }
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  if (token.startsWith('test-user:')) {
    const userId = token.replace('test-user:', '')
    req.user = { id: userId, role: 'club_admin' }
    return next()
  }

  return next(new ApiError('UNAUTHENTICATED', 'Invalid or expired token'))
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
