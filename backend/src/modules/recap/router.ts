import { Router } from 'express'
import {
  deleteGallery,
  patchGallery,
  postGallery,
} from './controller.js'
import { requireAuth, requireClubAdmin } from './guards.js'

export const recapRouter: Router = Router()

// AD-01: Bulk add gallery items (requires ended event + club owner)
recapRouter.post(
  '/events/:id/gallery',
  requireAuth,
  requireClubAdmin,
  postGallery,
)

// AD-01: Update gallery captions and ordering (requires ended event + club owner)
recapRouter.patch(
  '/events/:id/gallery',
  requireAuth,
  requireClubAdmin,
  patchGallery,
)

// AD-01: Delete single gallery item (requires ended event + club owner)
recapRouter.delete(
  '/gallery/:id',
  requireAuth,
  requireClubAdmin,
  deleteGallery,
)
