import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../../lib/errors.js'

export type UserRole = 'student' | 'club_admin' | 'super_admin'

export interface AuthUser {
  id: string
  role: UserRole
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

/**
 * Authentication check:
 * Enforces that `req.user` is present on the request.
 * In production, Ali's `requireAuth` middleware sets `req.user`.
 * In test harness strictly (NODE_ENV === 'test'), headers x-user-id
 * and x-user-role simulate authenticated callers.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user && process.env.NODE_ENV === 'test' && req.headers['x-user-id']) {
    const id = String(req.headers['x-user-id']).trim()
    const role = (req.headers['x-user-role'] as UserRole) || 'student'
    req.user = { id, role }
  }

  if (!req.user) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  next()
}

/**
 * Role authorization check:
 * Enforces that the authenticated user possesses club_admin or super_admin role.
 */
export function requireClubAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new ApiError('UNAUTHENTICATED', 'Authentication required'))
  }

  if (req.user.role !== 'club_admin' && req.user.role !== 'super_admin') {
    return next(
      new ApiError('FORBIDDEN', 'Only club administrators can perform this action'),
    )
  }

  next()
}
