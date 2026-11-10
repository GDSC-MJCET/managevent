import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import { rsvpService } from './services/rsvpService.js'
import { validateAnswers } from './services/answers.js'
import { createJwt, createResetToken, hashToken, RESET_TOKEN_TTL_MS } from './services/jwt.js'
import { hashPassword, verifyPassword } from './services/password.js'
import type {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RsvpAnswers,
  ResetPasswordBody,
  SignupBody,
  SubmitRsvpBody,
  UpdateProfileBody,
} from './schema.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getSingleParam(param: string | string[] | undefined): string | undefined {
  if (!param) return undefined
  return Array.isArray(param) ? param[0] : param
}

function requireEventId(id: string | string[] | undefined): string {
  const eventId = getSingleParam(id)
  if (!eventId || !UUID_REGEX.test(eventId)) {
    throw new ApiError('VALIDATION', 'Invalid event ID')
  }
  return eventId
}

function requireRsvpId(id: string | string[] | undefined): string {
  const rsvpId = getSingleParam(id)
  if (!rsvpId || !UUID_REGEX.test(rsvpId)) {
    throw new ApiError('VALIDATION', 'Invalid RSVP ID')
  }
  return rsvpId
}

function publicUser(user: {
  id: string
  name: string
  email: string
  role: string
  rollNumber: string | null
  branch: string | null
  year: number | null
  createdAt: Date
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    rollNumber: user.rollNumber,
    branch: user.branch,
    year: user.year,
    createdAt: user.createdAt.toISOString(),
  }
}

function mapPayment(payment: {
  status: string
  rejectReason: string | null
  verifiedAt: Date | null
} | null | undefined) {
  if (!payment) return null
  return {
    status: payment.status,
    rejectReason: payment.rejectReason,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
  }
}

// ── AL-03: signup / login / me ───────────────────────────────────────────────

export async function postSignup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as SignupBody

    // AL-03: signup can never create a super_admin — `role` (if sent) is discarded.
    const passwordHash = await hashPassword(body.password)
    try {
      const user = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: body.name,
          email: body.email,
          passwordHash,
          role: 'student',
        },
      })

      const token = createJwt({ id: user.id, role: user.role })
      res.status(201).json({ ok: true, data: { token, user: publicUser(user) }, error: null })
    } catch (createErr: unknown) {
      const code = (createErr as { code?: string }).code
      if (code === 'P2002') {
        return next(new ApiError('CONFLICT', 'An account with this email already exists'))
      }
      throw createErr
    }
  } catch (err) {
    next(err)
  }
}

export async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as LoginBody

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      return next(new ApiError('UNAUTHENTICATED', 'Invalid email or password'))
    }

    const valid = await verifyPassword(body.password, user.passwordHash)
    if (!valid) {
      return next(new ApiError('UNAUTHENTICATED', 'Invalid email or password'))
    }

    const token = createJwt({ id: user.id, role: user.role })
    res.json({ ok: true, data: { token, user: publicUser(user) }, error: null })
  } catch (err) {
    next(err)
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
      return next(new ApiError('UNAUTHENTICATED', 'Account not found'))
    }
    res.json({ ok: true, data: { user: publicUser(user) }, error: null })
  } catch (err) {
    next(err)
  }
}

// ── AL-06: profile + password ────────────────────────────────────────────────

export async function patchMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as UpdateProfileBody

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.rollNumber !== undefined ? { rollNumber: body.rollNumber } : {}),
        ...(body.branch !== undefined ? { branch: body.branch } : {}),
        ...(body.year !== undefined ? { year: body.year } : {}),
      },
    })
    res.json({ ok: true, data: { user: publicUser(user) }, error: null })
  } catch (err) {
    next(err)
  }
}

export async function patchPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as ChangePasswordBody

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
      return next(new ApiError('UNAUTHENTICATED', 'Account not found'))
    }

    const valid = await verifyPassword(body.currentPassword, user.passwordHash)
    if (!valid) {
      return next(new ApiError('UNAUTHENTICATED', 'Current password is incorrect'))
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    })

    res.json({ ok: true, data: { updated: true }, error: null })
  } catch (err) {
    next(err)
  }
}

export async function postForgot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as ForgotPasswordBody

    const user = await prisma.user.findUnique({ where: { email: body.email } })

    // No user enumeration: the response is identical either way.
    const genericMessage = 'If that email is registered, a reset token has been issued.'
    if (user) {
      const { token, tokenHash } = createResetToken()
      await prisma.passwordReset.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      })
      // Email delivery is out of scope in v1 (README section 9): the token is
      // handed to the operator instead of a mail service.
      console.log(`Password reset requested for ${user.email}. Reset token: ${token}`)

      res.json({
        ok: true,
        data: {
          message: genericMessage,
          // Token surfaces outside production for local and test flows only.
          ...(process.env.NODE_ENV !== 'production' ? { resetToken: token } : {}),
        },
        error: null,
      })
      return
    }

    res.json({ ok: true, data: { message: genericMessage }, error: null })
  } catch (err) {
    next(err)
  }
}

export async function postReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as ResetPasswordBody

    const resets = await prisma.passwordReset.findFirst({
      where: { tokenHash: hashToken(body.token) },
    })

    const invalid = !resets || resets.usedAt != null || resets.expiresAt.getTime() <= Date.now()
    if (invalid) {
      return next(new ApiError('UNAUTHENTICATED', 'Reset token is invalid, expired or already used'))
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resets!.userId },
        data: { passwordHash: await hashPassword(body.newPassword) },
      }),
      // Single use: consume this token now. Outstanding tokens are irrelevant —
      // only the hashed token presented can be replayed, and this one is spent.
      prisma.passwordReset.update({
        where: { id: resets!.id },
        data: { usedAt: new Date() },
      }),
    ])

    res.json({ ok: true, data: { updated: true }, error: null })
  } catch (err) {
    next(err)
  }
}

// ── AL-07: RSVP submits ─────────────────────────────────────────────────────

export async function submitRsvp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const eventId = requireEventId(req.params.id ?? req.params.eventId)
    const body = req.body as SubmitRsvpBody

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        rsvpFormFields: { orderBy: { position: 'asc' } },
        settings: true,
      },
    })
    if (!event) {
      return next(new ApiError('NOT_FOUND', 'Event not found'))
    }
    if (event.status !== 'open') {
      return next(new ApiError('EVENT_NOT_OPEN', 'RSVPs are only accepted while the event is open'))
    }

    if (event.settings?.isPaid === true) {
      if (!event.settings.qrUrl) {
        return next(new ApiError('QR_REQUIRED', 'This event has no payment QR configured yet'))
      }
      if (!body.screenshotUrl) {
        return next(new ApiError('VALIDATION', 'A payment screenshot URL is required for paid events'))
      }
    }

    const answers: RsvpAnswers = (body.answers ?? {}) as RsvpAnswers
    const invalidAnswer = validateAnswers(event.rsvpFormFields, answers)
    if (invalidAnswer) {
      return next(new ApiError('VALIDATION', invalidAnswer))
    }

    const result = await rsvpService.createRsvp({
      eventId,
      userId: req.user!.id,
      answers,
      screenshotUrl: body.screenshotUrl,
    })

    if (!result.success) {
      const code = result.error?.code || 'CONFLICT'
      return next(new ApiError(code, result.error?.message || 'RSVP failed'))
    }

    res.status(201).json({
      ok: true,
      data: {
        id: result.rsvp!.id,
        eventId: result.rsvp!.eventId,
        userId: result.rsvp!.userId,
        status: result.rsvp!.status,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

// ── AL-08: cancel / my rsvps / my rsvp for one event ────────────────────────

export async function cancelRsvp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rsvpId = requireRsvpId(req.params.id)

    const result = await rsvpService.cancel(rsvpId, req.user!.id)
    if (!result.success) {
      const code = result.error?.code || 'CONFLICT'
      return next(new ApiError(code, result.error?.message || 'Cancellation failed'))
    }

    res.json({
      ok: true,
      data: {
        id: result.rsvp!.id,
        eventId: result.rsvp!.eventId,
        status: result.rsvp!.status,
        promotedRsvpIds: result.promotedRsvpIds ?? [],
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function getMyRsvps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = getValidatedQuery<{ page: number; limit: number } | undefined>(res)
    const page = Math.max(query?.page ?? 1, 1)
    const limit = Math.min(Math.max(query?.limit ?? 20, 1), 100)

    const where = { userId: req.user!.id }
    const [total, rsvps] = await Promise.all([
      prisma.rsvp.count({ where }),
      prisma.rsvp.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          event: {
            select: {
              id: true,
              title: true,
              venue: true,
              startsAt: true,
              endsAt: true,
              status: true,
              club: { select: { id: true, name: true } },
            },
          },
          payment: { select: { status: true, rejectReason: true, verifiedAt: true } },
          checkin: { select: { checkedInAt: true } },
        },
      }),
    ])

    res.json({
      ok: true,
      data: {
        items: rsvps.map((item) => ({
          id: item.id,
          eventId: item.eventId,
          status: item.status,
          answers: item.answers,
          createdAt: item.createdAt.toISOString(),
          event: {
            id: item.event.id,
            title: item.event.title,
            venue: item.event.venue,
            startsAt: item.event.startsAt.toISOString(),
            endsAt: item.event.endsAt.toISOString(),
            status: item.event.status,
            club: item.event.club,
          },
          payment: mapPayment(item.payment),
          checkedInAt: item.checkin?.checkedInAt?.toISOString() ?? null,
        })),
        page,
        limit,
        total,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function getMyRsvpForEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const eventId = requireEventId(req.params.id ?? req.params.eventId)

    const rsvp = await prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId, userId: req.user!.id } },
      include: {
        payment: { select: { status: true, rejectReason: true, verifiedAt: true } },
        checkin: { select: { checkedInAt: true } },
      },
    })

    res.json({
      ok: true,
      data: rsvp
        ? {
            id: rsvp.id,
            eventId: rsvp.eventId,
            userId: rsvp.userId,
            status: rsvp.status,
            answers: rsvp.answers,
            createdAt: rsvp.createdAt.toISOString(),
            payment: mapPayment(rsvp.payment),
            checkedInAt: rsvp.checkin?.checkedInAt?.toISOString() ?? null,
          }
        : null,
      error: null,
    })
  } catch (err) {
    next(err)
  }
}
