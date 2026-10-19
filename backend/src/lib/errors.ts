import type { NextFunction, Request, Response } from 'express'

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EVENT_FULL'
  | 'EVENT_NOT_OPEN'
  | 'QR_REQUIRED'
  | 'CAPACITY_BELOW_APPROVED'
  | 'ALREADY_RSVPED'
  | 'NOT_APPROVED'
  | 'QUESTION_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'RECAP_LOCKED'
  | 'UPLOAD_REJECTED'
  | 'INTERNAL'

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EVENT_FULL: 409,
  EVENT_NOT_OPEN: 409,
  QR_REQUIRED: 409,
  CAPACITY_BELOW_APPROVED: 409,
  ALREADY_RSVPED: 409,
  NOT_APPROVED: 403,
  QUESTION_CLOSED: 409,
  ALREADY_ANSWERED: 409,
  RECAP_LOCKED: 409,
  UPLOAD_REJECTED: 422,
  INTERNAL: 500,
}

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = statusByCode[code]
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    data: null,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} was not found`,
    },
  })
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      ok: false,
      data: null,
      error: { code: error.code, message: error.message },
    })
    return
  }

  console.error(error)

  res.status(500).json({
    ok: false,
    data: null,
    error: { code: 'INTERNAL', message: 'Something went wrong' },
  })
}
