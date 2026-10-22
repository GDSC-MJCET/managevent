import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../../db/index.js'
import { Prisma } from '@prisma/client'
import { ApiError } from '../../lib/errors.js'
import { parseOptionalAuth } from '../../middleware/auth.js'
import { getValidatedQuery } from '../../middleware/validate.js'
import type {
  PutRsvpFormBody,
  RsvpFormFieldInput,
  GetEventRsvpsQuery,
  PatchRsvpBody,
  BulkApproveRsvpsBody,
  RsvpStatus,
  GetEventPaymentsQuery,
  PatchPaymentBody,
  PaymentStatus,
} from './schema.js'
import { getRsvpTransitionService } from './services/rsvpTransitionProvider.js'
import { generateAttendeesCsv } from './services/csvExport.js'

function getSingleParam(param: string | string[] | undefined): string | undefined {
  if (!param) return undefined
  return Array.isArray(param) ? param[0] : param
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatFormField(f: {
  id: string
  label: string
  type: any
  required: boolean
  position: number
  options: unknown
}) {
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    required: f.required,
    position: f.position,
    options: Array.isArray(f.options) ? (f.options as string[]) : null,
  }
}

// ── AN-01: Custom RSVP Form ──────────────────────────────────────────────────

export async function getRsvpForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return next(new ApiError('VALIDATION', 'Invalid event ID'))
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        club: {
          select: { ownerId: true },
        },
      },
    })

    if (!event) {
      return next(new ApiError('NOT_FOUND', 'Event not found'))
    }

    // BR-E4: Students only see open|live|ended events. draft is club-only.
    if (event.status === 'draft') {
      parseOptionalAuth(req)
      const isOwner = req.user && req.user.id === event.club.ownerId
      if (!isOwner) {
        return next(new ApiError('FORBIDDEN', 'Only the club owner can view draft event RSVP forms'))
      }
    }

    const fields = await prisma.rsvpFormField.findMany({
      where: { eventId },
      orderBy: { position: 'asc' },
    })

    res.json({
      ok: true,
      data: {
        eventId,
        fields: fields.map(formatFormField),
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function putRsvpForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const body = req.body as PutRsvpFormBody

  try {
    const createdFields = await prisma.$transaction(async (tx) => {
      await tx.rsvpFormField.deleteMany({
        where: { eventId },
      })

      if (body.fields.length === 0) {
        return []
      }

      await tx.rsvpFormField.createMany({
        data: body.fields.map((f: RsvpFormFieldInput) => ({
          id: crypto.randomUUID(),
          eventId,
          label: f.label,
          type: f.type,
          required: f.required,
          position: f.position,
          options: f.options ?? undefined,
        })),
      })

      return tx.rsvpFormField.findMany({
        where: { eventId },
        orderBy: { position: 'asc' },
      })
    })

    res.json({
      ok: true,
      data: {
        eventId,
        fields: createdFields.map(formatFormField),
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

// ── AN-02: Attendee Operations ───────────────────────────────────────────────

export async function getEventRsvps(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const query = getValidatedQuery<GetEventRsvpsQuery>(res)
  const page = query.page
  const limit = query.limit
  const status = query.status

  try {
    const where = {
      eventId,
      ...(status ? { status } : {}),
    }

    const [total, items] = await Promise.all([
      prisma.rsvp.count({ where }),
      prisma.rsvp.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              rollNumber: true,
              branch: true,
              year: true,
            },
          },
        },
      }),
    ])

    const formattedItems = items.map((item) => ({
      id: item.id,
      eventId: item.eventId,
      userId: item.userId,
      user: item.user,
      status: item.status,
      answers: item.answers,
      createdAt: item.createdAt.toISOString(),
    }))

    res.json({
      ok: true,
      data: {
        items: formattedItems,
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

export async function patchRsvp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rsvpId = getSingleParam(req.params.id)

  if (!rsvpId || !UUID_REGEX.test(rsvpId)) {
    return next(new ApiError('VALIDATION', 'Invalid RSVP ID'))
  }

  const body = req.body as PatchRsvpBody

  try {
    const rsvp = await prisma.rsvp.findUnique({
      where: { id: rsvpId },
      include: {
        event: {
          include: { club: true },
        },
      },
    })

    if (!rsvp) {
      return next(new ApiError('NOT_FOUND', 'RSVP not found'))
    }

    if (rsvp.event.club.ownerId !== req.user!.id) {
      return next(new ApiError('FORBIDDEN', 'Only the club owner can update this RSVP'))
    }

    // Call Ali's shared transition engine (BR-R10)
    const transitionService = getRsvpTransitionService()
    const result = await transitionService.transition({
      rsvpId,
      toStatus: body.status,
      actorId: req.user!.id,
      reason: body.reason,
    })

    if (!result.success) {
      const code = result.error?.code || 'CONFLICT'
      const message = result.error?.message || 'Transition failed'
      return next(new ApiError(code, message))
    }

    res.json({
      ok: true,
      data: {
        id: rsvpId,
        status: body.status,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function bulkApproveRsvps(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const body = req.body as BulkApproveRsvpsBody
  const uniqueIds = [...new Set(body.rsvpIds)]

  try {
    const existingRsvps = await prisma.rsvp.findMany({
      where: {
        id: { in: uniqueIds },
        eventId,
      },
      select: { id: true, status: true },
    })

    const foundMap = new Map(existingRsvps.map((r) => [r.id, r]))
    const approved: string[] = []
    const unapproved: Array<{ rsvpId: string; reason: string }> = []

    const transitionService = getRsvpTransitionService()
    let capacityExhausted = false

    for (const rsvpId of uniqueIds) {
      const rsvp = foundMap.get(rsvpId)

      if (!rsvp) {
        unapproved.push({ rsvpId, reason: 'RSVP does not belong to this event' })
        continue
      }

      if (rsvp.status === 'approved') {
        approved.push(rsvpId)
        continue
      }

      if (capacityExhausted) {
        unapproved.push({ rsvpId, reason: 'Event capacity reached' })
        continue
      }

      const result = await transitionService.transition({
        rsvpId,
        toStatus: 'approved',
        actorId: req.user!.id,
      })

      if (result.success) {
        approved.push(rsvpId)
      } else {
        if (result.error?.code === 'EVENT_FULL') {
          capacityExhausted = true
          unapproved.push({ rsvpId, reason: 'Event capacity reached' })
        } else {
          unapproved.push({ rsvpId, reason: result.error?.message || 'Transition failed' })
        }
      }
    }

    res.json({
      ok: true,
      data: {
        approved,
        unapproved,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function exportEventRsvps(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const query = getValidatedQuery<GetEventRsvpsQuery>(res)
  const status = query.status

  try {
    const rsvps = await prisma.rsvp.findMany({
      where: {
        eventId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            rollNumber: true,
            branch: true,
            year: true,
          },
        },
      },
    })

    const csvContent = generateAttendeesCsv(rsvps)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="attendees-${eventId}.csv"`)
    res.status(200).send(csvContent)
  } catch (err) {
    next(err)
  }
}

// ── AN-03: Payment Verification ─────────────────────────────────────────────

export async function getEventPayments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const query = getValidatedQuery<GetEventPaymentsQuery>(res)
  const page = query.page
  const limit = query.limit
  const status = query.status

  try {
    const where = {
      rsvp: {
        eventId,
      },
      ...(status ? { status } : {}),
    }

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          rsvp: {
            select: {
              id: true,
              userId: true,
              status: true,
              answers: true,
              user: {
                select: {
                  name: true,
                  email: true,
                  rollNumber: true,
                  branch: true,
                  year: true,
                },
              },
            },
          },
        },
      }),
    ])

    const formattedItems = payments.map((p) => ({
      id: p.id,
      rsvpId: p.rsvpId,
      screenshotUrl: p.screenshotUrl,
      status: p.status,
      rejectReason: p.rejectReason,
      verifiedBy: p.verifiedBy,
      verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      rsvp: {
        id: p.rsvp.id,
        userId: p.rsvp.userId,
        status: p.rsvp.status,
        answers: p.rsvp.answers,
        user: p.rsvp.user,
      },
    }))

    res.json({
      ok: true,
      data: {
        items: formattedItems,
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

export async function patchPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rsvpId = getSingleParam(req.params.rsvpId ?? req.params.id)

  if (!rsvpId || !UUID_REGEX.test(rsvpId)) {
    return next(new ApiError('VALIDATION', 'Invalid RSVP ID'))
  }

  const body = req.body as PatchPaymentBody

  try {
    const payment = await prisma.payment.findUnique({
      where: { rsvpId },
      include: {
        rsvp: {
          include: {
            event: {
              include: { club: true },
            },
          },
        },
      },
    })

    if (!payment) {
      return next(new ApiError('NOT_FOUND', 'Payment record not found'))
    }

    if (payment.rsvp.event.club.ownerId !== req.user!.id) {
      return next(new ApiError('FORBIDDEN', 'Only the club owner can verify payments'))
    }

    const now = new Date()
    const isVerification = body.status === 'verified'

    // Integrate with Ali's shared transition engine (BR-R5, BR-R6, BR-R10)
    // On verification: Ali's engine applies BR-R5 (auto -> approved/waitlist, manual -> pending).
    // On rejection: Ali's engine keeps RSVP pending for screenshot resubmission (BR-R6).
    const transitionService = getRsvpTransitionService()
    const targetStatus = isVerification ? 'payment_verified' : 'payment_rejected'
    const transitionResult = await transitionService.transition({
      rsvpId,
      toStatus: targetStatus,
      actorId: req.user!.id,
      reason: isVerification ? undefined : body.rejectReason,
    })

    if (!transitionResult.success) {
      const code = transitionResult.error?.code || 'CONFLICT'
      const message = transitionResult.error?.message || 'RSVP transition failed'
      return next(new ApiError(code, message))
    }

    try {
      const updatedPayment = await prisma.payment.update({
        where: { rsvpId },
        data: {
          status: body.status,
          verifiedBy: req.user!.id,
          verifiedAt: now,
          rejectReason: isVerification ? null : body.rejectReason,
        },
      })

      res.json({
        ok: true,
        data: {
          id: updatedPayment.id,
          rsvpId: updatedPayment.rsvpId,
          status: updatedPayment.status,
          rejectReason: updatedPayment.rejectReason,
          verifiedBy: updatedPayment.verifiedBy,
          verifiedAt: updatedPayment.verifiedAt?.toISOString() ?? null,
          rsvpStatus: transitionResult.rsvp?.status,
        },
        error: null,
      })
    } catch (dbErr) {
      // Consistency handling: Attempt compensating rollback to 'pending' if payment update fails
      try {
        await transitionService.transition({
          rsvpId,
          toStatus: 'pending',
          actorId: req.user!.id,
          reason: 'Compensating rollback: payment record update failed after RSVP transition',
        })
      } catch (compensationErr) {
        console.error('CRITICAL: Compensation rollback failed for rsvpId:', rsvpId, compensationErr)
      }
      return next(dbErr)
    }
  } catch (err) {
    next(err)
  }
}

// ── AN-04: Event-Day Check-in & Operations ──────────────────────────────────

export async function postCheckin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)
  const rsvpId = getSingleParam(req.params.rsvpId)

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return next(new ApiError('VALIDATION', 'Invalid event ID'))
  }

  if (!rsvpId || !UUID_REGEX.test(rsvpId)) {
    return next(new ApiError('VALIDATION', 'Invalid RSVP ID'))
  }

  try {
    const [event, rsvp] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      }),
      prisma.rsvp.findUnique({
        where: { id: rsvpId },
        select: { id: true, eventId: true, status: true },
      }),
    ])

    if (!event) {
      return next(new ApiError('NOT_FOUND', 'Event not found'))
    }

    // BR-R8: Check-in only allowed while event is live
    if (event.status !== 'live') {
      return next(new ApiError('CONFLICT', 'Check-in is only allowed when event is live'))
    }

    if (!rsvp || rsvp.eventId !== eventId) {
      return next(new ApiError('NOT_FOUND', 'RSVP not found for this event'))
    }

    // BR-R8: Check-in only allowed for approved RSVPs
    if (rsvp.status !== 'approved') {
      return next(new ApiError('NOT_APPROVED', 'Only approved RSVPs can be checked in'))
    }

    // BR-R8: Idempotent check-in with atomic create and P2002 unique-conflict recovery.
    // Preserves original checkedInAt and checkedInBy on repeat requests or race conditions.
    let checkin
    try {
      checkin = await prisma.checkin.create({
        data: {
          id: crypto.randomUUID(),
          rsvpId,
          checkedInBy: req.user!.id,
        },
      })
    } catch (createErr: unknown) {
      const isUniqueConflict =
        (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') ||
        (typeof createErr === 'object' && createErr !== null && (createErr as { code?: string }).code === 'P2002')

      if (isUniqueConflict) {
        const existing = await prisma.checkin.findUnique({
          where: { rsvpId },
        })
        if (!existing) {
          throw createErr
        }
        checkin = existing
      } else {
        throw createErr
      }
    }

    res.json({
      ok: true,
      data: {
        id: checkin.id,
        rsvpId: checkin.rsvpId,
        checkedInAt: checkin.checkedInAt.toISOString(),
        checkedInBy: checkin.checkedInBy,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function deleteCheckin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)
  const rsvpId = getSingleParam(req.params.rsvpId)

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return next(new ApiError('VALIDATION', 'Invalid event ID'))
  }

  if (!rsvpId || !UUID_REGEX.test(rsvpId)) {
    return next(new ApiError('VALIDATION', 'Invalid RSVP ID'))
  }

  try {
    const rsvp = await prisma.rsvp.findUnique({
      where: { id: rsvpId },
      select: { id: true, eventId: true },
    })

    if (!rsvp || rsvp.eventId !== eventId) {
      return next(new ApiError('NOT_FOUND', 'RSVP not found for this event'))
    }

    // BR-R8: Idempotent undo check-in
    await prisma.checkin.deleteMany({
      where: { rsvpId },
    })

    res.json({
      ok: true,
      data: {
        rsvpId,
        checkedIn: false,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

export async function getEventOpsMetrics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const eventId = getSingleParam(req.params.id ?? req.params.eventId)

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return next(new ApiError('VALIDATION', 'Invalid event ID'))
  }

  try {
    const [registeredCount, approvedCount, checkedInCount] = await Promise.all([
      // registeredCount: all RSVP records for the event except those with cancelled status
      prisma.rsvp.count({
        where: {
          eventId,
          status: { not: 'cancelled' },
        },
      }),
      // approvedCount: all RSVP records for the event whose current status is approved
      prisma.rsvp.count({
        where: {
          eventId,
          status: 'approved',
        },
      }),
      // checkedInCount: check-in records whose associated RSVP belongs to the event
      prisma.checkin.count({
        where: {
          rsvp: {
            eventId,
          },
        },
      }),
    ])

    res.json({
      ok: true,
      data: {
        eventId,
        registeredCount,
        approvedCount,
        checkedInCount,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}


