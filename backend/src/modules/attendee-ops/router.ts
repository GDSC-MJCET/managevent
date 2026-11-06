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
  getEventPayments,
  patchPayment,
  postCheckin,
  deleteCheckin,
  getEventOpsMetrics,
} from './controller.js'
import {
  PutRsvpFormBodySchema,
  GetEventRsvpsQuerySchema,
  PatchRsvpBodySchema,
  BulkApproveRsvpsBodySchema,
  GetEventPaymentsQuerySchema,
  PatchPaymentBodySchema,
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

// AN-03: Payment verification
attendeeOpsRouter.get(
  '/events/:id/payments',
  requireAuth,
  requireClubOwner,
  validateQuery(GetEventPaymentsQuerySchema),
  getEventPayments,
)

attendeeOpsRouter.patch(
  '/payments/:rsvpId',
  requireAuth,
  validateBody(PatchPaymentBodySchema),
  patchPayment,
)

// AN-04: Event-day check-in & operations
attendeeOpsRouter.post(
  '/events/:id/checkin/:rsvpId',
  requireAuth,
  requireClubOwner,
  postCheckin,
)

attendeeOpsRouter.delete(
  '/events/:id/checkin/:rsvpId',
  requireAuth,
  requireClubOwner,
  deleteCheckin,
)

attendeeOpsRouter.get(
  '/events/:id/ops',
  requireAuth,
  requireClubOwner,
  getEventOpsMetrics,
)

