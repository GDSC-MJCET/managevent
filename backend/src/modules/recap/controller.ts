import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../../lib/errors.js'
import {
  BulkCreateGalleryBodySchema,
  EventParamSchema,
  GalleryItemParamSchema,
  PatchGalleryBodySchema,
} from './schema.js'
import { galleryService } from './service.js'

export async function postGallery(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const paramParsed = EventParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      throw new ApiError('VALIDATION', 'Invalid event ID')
    }

    const bodyParsed = BulkCreateGalleryBodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      const issue = bodyParsed.error.issues[0]
      const path = issue && issue.path.length > 0 ? issue.path.join('.') : 'body'
      const message = issue ? `${path}: ${issue.message}` : 'Validation error'
      throw new ApiError('VALIDATION', message)
    }

    const userId = req.user?.id
    if (!userId) {
      throw new ApiError('UNAUTHENTICATED', 'Authentication required')
    }

    const result = await galleryService.bulkCreateGallery(
      paramParsed.data.id,
      userId,
      bodyParsed.data.items,
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

export async function patchGallery(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const paramParsed = EventParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      throw new ApiError('VALIDATION', 'Invalid event ID')
    }

    const bodyParsed = PatchGalleryBodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      const issue = bodyParsed.error.issues[0]
      const path = issue && issue.path.length > 0 ? issue.path.join('.') : 'body'
      const message = issue ? `${path}: ${issue.message}` : 'Validation error'
      throw new ApiError('VALIDATION', message)
    }

    const userId = req.user?.id
    if (!userId) {
      throw new ApiError('UNAUTHENTICATED', 'Authentication required')
    }

    const result = await galleryService.updateGallery(
      paramParsed.data.id,
      userId,
      bodyParsed.data.items,
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

export async function deleteGallery(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const paramParsed = GalleryItemParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      throw new ApiError('VALIDATION', 'Invalid gallery item ID')
    }

    const userId = req.user?.id
    if (!userId) {
      throw new ApiError('UNAUTHENTICATED', 'Authentication required')
    }

    const result = await galleryService.deleteGalleryItem(
      paramParsed.data.id,
      userId,
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
