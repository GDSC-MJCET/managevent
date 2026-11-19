import { Router } from 'express'
import {
  getEventCertificates,
  getMyCertificates,
  postCertificates,
} from './certificates.controller.js'
import { requireAuth, requireClubAdmin } from './guards.js'

export const certificatesRouter: Router = Router()

// AD-02: Student retrieves their own certificates (BR-P4)
certificatesRouter.get(
  '/me/certificates',
  requireAuth,
  getMyCertificates,
)

// AD-02: Club owner views all certificates issued for an event
certificatesRouter.get(
  '/events/:id/certificates',
  requireAuth,
  requireClubAdmin,
  getEventCertificates,
)

// AD-02: Club owner assigns certificate(s) to approved/checked-in attendees
certificatesRouter.post(
  '/events/:id/certificates',
  requireAuth,
  requireClubAdmin,
  postCertificates,
)
