import { Router } from 'express'
import {
  requireAuth,
} from '../../middleware/auth.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import {
  cancelRsvp,
  getMe,
  getMyRsvpForEvent,
  getMyRsvps,
  patchMe,
  patchPassword,
  postForgot,
  postLogin,
  postReset,
  postSignup,
  submitRsvp,
} from './controller.js'
import {
  ChangePasswordBodySchema,
  ForgotPasswordBodySchema,
  LoginBodySchema,
  ResetPasswordBodySchema,
  SignupBodySchema,
  SubmitRsvpBodySchema,
  UpdateProfileBodySchema,
} from './schema.js'
import { PageQuerySchema } from './schema.js'

// AL-03 / AL-06: auth and profile endpoints.
// AL-07 / AL-08: student RSVP endpoints. Status writes stay inside
// rsvpService (BR-R10).

export const authRsvpRouter: Router = Router()

authRsvpRouter.post('/auth/signup', validateBody(SignupBodySchema), postSignup)
authRsvpRouter.post('/auth/login', validateBody(LoginBodySchema), postLogin)
authRsvpRouter.get('/auth/me', requireAuth, getMe)

authRsvpRouter.patch('/auth/me', requireAuth, validateBody(UpdateProfileBodySchema), patchMe)
authRsvpRouter.patch('/auth/password', requireAuth, validateBody(ChangePasswordBodySchema), patchPassword)
authRsvpRouter.post('/auth/forgot', validateBody(ForgotPasswordBodySchema), postForgot)
authRsvpRouter.post('/auth/reset', validateBody(ResetPasswordBodySchema), postReset)

// RSVP (Ali's RSVP engine)
authRsvpRouter.post('/events/:id/rsvp', requireAuth, validateBody(SubmitRsvpBodySchema), submitRsvp)
authRsvpRouter.delete('/rsvps/:id', requireAuth, cancelRsvp)
authRsvpRouter.get('/me/rsvps', requireAuth, validateQuery(PageQuerySchema), getMyRsvps)
authRsvpRouter.get('/events/:id/rsvp/me', requireAuth, getMyRsvpForEvent)
