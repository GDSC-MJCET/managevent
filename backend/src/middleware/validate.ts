import type { NextFunction, Request, Response } from 'express'
import type { ZodSchema } from 'zod'
import { ApiError } from '../lib/errors.js'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const issue = result.error.issues[0]
      const path = issue && issue.path.length > 0 ? issue.path.join('.') : 'body'
      const message = issue ? `${path}: ${issue.message}` : 'Validation error'
      return next(new ApiError('VALIDATION', message))
    }
    req.body = result.data
    next()
  }
}

export function validateQuery<T extends Record<string, any>>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const issue = result.error.issues[0]
      const path = issue && issue.path.length > 0 ? issue.path.join('.') : 'query'
      const message = issue ? `${path}: ${issue.message}` : 'Validation error'
      return next(new ApiError('VALIDATION', message))
    }
    for (const key of Object.keys(req.query)) {
      delete (req.query as Record<string, unknown>)[key]
    }
    Object.assign(req.query, result.data)
    next()
  }
}

