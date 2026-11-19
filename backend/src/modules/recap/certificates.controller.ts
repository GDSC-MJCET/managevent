import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../../lib/errors.js'
import {
  AssignCertificateBodySchema,
  EventParamSchema,
} from './certificates.schema.js'
import { certificateService } from './certificates.service.js'

export async function postCertificates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const paramParsed = EventParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      throw new ApiError('VALIDATION', 'Invalid event ID')
    }

    const bodyParsed = AssignCertificateBodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      const issue = bodyParsed.error.issues[0]
      const path = issue && issue.path.length > 0 ? issue.path.join('.') : 'body'
      const message = issue ? `${path}: ${issue.message}` : 'Validation error'
      throw new ApiError('VALIDATION', message)
    }

    const callerId = req.user?.id
    if (!callerId) {
      throw new ApiError('UNAUTHENTICATED', 'Authentication required')
    }

    const result = await certificateService.assignCertificates(
      paramParsed.data.id,
      callerId,
      bodyParsed.data,
    )

    res.status(201).json({
      ok: true,
      data: result,
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function getMyCertificates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const studentId = req.user?.id
    if (!studentId) {
      throw new ApiError('UNAUTHENTICATED', 'Authentication required')
    }

    const result = await certificateService.getStudentCertificates(studentId)

    res.status(200).json({
      ok: true,
      data: result,
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function getEventCertificates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const paramParsed = EventParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      throw new ApiError('VALIDATION', 'Invalid event ID')
    }

    const callerId = req.user?.id
    if (!callerId) {
      throw new ApiError('UNAUTHENTICATED', 'Authentication required')
    }

    const result = await certificateService.getEventCertificates(
      paramParsed.data.id,
      callerId,
    )

    res.status(200).json({
      ok: true,
      data: result,
      error: null,
    })
  } catch (err) {
    next(err)
  }
}
