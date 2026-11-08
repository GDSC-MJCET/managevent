import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@prisma/client'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'

/**
 * TEMPORARY adapter for Ali's guards (AL-04), which are not in the repo yet.
 * Every auth lookup in the Events module goes through this file, so when
 * Ali's `requireAuth` lands you only change this file.
 *
 * Until then, outside production, send header `x-dev-user-id: <user uuid>`
 * and the user is loaded from the database. Real JWTs are NOT verified here.
 */

export interface AuthUser {
  id: string
  role: Role
}

const KEY = 'authUser'

async function resolveUser(req: Request): Promise<AuthUser | null> {
  if (env.NODE_ENV === 'production') return null

  const id = req.header('x-dev-user-id')
  if (!id || !z.uuid().safeParse(id).success) return null

  return prisma.user.findUnique({ where: { id }, select: { id: true, role: true } })
}

export async function optionalUser(req: Request, res: Response, next: NextFunction) {
  res.locals[KEY] = await resolveUser(req)
  next()
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await resolveUser(req)
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue')
  res.locals[KEY] = user
  next()
}

export function getUser(res: Response): AuthUser | null {
  return (res.locals[KEY] as AuthUser | null | undefined) ?? null
}

export function getRequiredUser(res: Response): AuthUser {
  const user = getUser(res)
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue')
  return user
}