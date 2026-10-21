import { Router } from 'express'
import { requireAuth, requireClubOwner } from '../../middleware/auth.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import {
  getRsvpForm,
  putRsvpForm,
  getEventRsvps,
  patchRsvp,
  bulkApproveRsvps,
  exportEventRsvps,
} from './controller.js'
import {
  PutRsvpFormBodySchema,
  GetEventRsvpsQuerySchema,
  PatchRsvpBodySchema,
  BulkApproveRsvpsBodySchema,
} from './schema.js'

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

// AN-02: Attendee operations
attendeeOpsRouter.get(
  '/events/:id/rsvps/export',
  requireAuth,
  requireClubOwner,
  validateQuery(GetEventRsvpsQuerySchema),
  exportEventRsvps,
)

attendeeOpsRouter.get(
  '/events/:id/rsvps',
  requireAuth,
  requireClubOwner,
  validateQuery(GetEventRsvpsQuerySchema),
  getEventRsvps,
)

attendeeOpsRouter.patch(
  '/rsvps/:id',
  requireAuth,
  validateBody(PatchRsvpBodySchema),
  patchRsvp,
)

attendeeOpsRouter.post(
  '/events/:id/rsvps/bulk',
  requireAuth,
  requireClubOwner,
  validateBody(BulkApproveRsvpsBodySchema),
  bulkApproveRsvps,
)
