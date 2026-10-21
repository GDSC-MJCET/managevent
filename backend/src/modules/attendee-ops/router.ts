import { Router } from 'express'
import { requireAuth, requireClubOwner } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { getRsvpForm, putRsvpForm } from './controller.js'
import { PutRsvpFormBodySchema } from './schema.js'

export const attendeeOpsRouter: Router = Router()

// AN-01: Custom RSVP form
attendeeOpsRouter.get('/events/:id/rsvp-form', getRsvpForm)
attendeeOpsRouter.put(
  '/events/:id/rsvp-form',
  requireAuth,
  requireClubOwner,
  validateBody(PutRsvpFormBodySchema),
  putRsvpForm,
)
