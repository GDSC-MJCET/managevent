import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import { parseOptionalAuth } from '../../middleware/auth.js'
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

// ── AN-01: Custom RSVP Form ──────────────────────────────────────────────────

export async function getRsvpForm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
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

    const formattedFields = fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      position: f.position,
      options: Array.isArray(f.options) ? (f.options as string[]) : null,
    }))

    res.json({
      ok: true,
      data: {
        eventId,
        fields: formattedFields,
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
  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const body = req.body as PutRsvpFormBody

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    })

    if (!event) {
      return next(new ApiError('NOT_FOUND', 'Event not found'))
    }

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

    const formattedFields = createdFields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      position: f.position,
      options: Array.isArray(f.options) ? (f.options as string[]) : null,
    }))

    res.json({
      ok: true,
      data: {
        eventId,
        fields: formattedFields,
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
  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const query = req.query as unknown as GetEventRsvpsQuery
  const page = query.page ?? 1
  const limit = query.limit ?? 20
  const status = query.status as RsvpStatus | undefined

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
  const rawId = req.params.id
  const rsvpId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!rsvpId) {
    return next(new ApiError('VALIDATION', 'RSVP ID is required'))
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
  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const body = req.body as BulkApproveRsvpsBody
  const uniqueIds = Array.from(new Set(body.rsvpIds))

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
  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const query = req.query as unknown as GetEventRsvpsQuery
  const status = query.status as RsvpStatus | undefined

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
  const rawId = req.params.id ?? req.params.eventId
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!eventId) {
    return next(new ApiError('VALIDATION', 'Event ID is required'))
  }

  const query = req.query as unknown as GetEventPaymentsQuery
  const page = query.page ?? 1
  const limit = query.limit ?? 20
  const status = query.status as PaymentStatus | undefined

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
  const rawId = req.params.rsvpId ?? req.params.id
  const rsvpId = Array.isArray(rawId) ? rawId[0] : rawId

  if (!rsvpId) {
    return next(new ApiError('VALIDATION', 'RSVP ID is required'))
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

    // Integrate with Ali's shared transition engine (BR-R5, BR-R10)
    const transitionService = getRsvpTransitionService()
    const targetStatus = isVerification ? 'approved' : 'rejected'
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
        verifiedAt: updatedPayment.verifiedAt ? updatedPayment.verifiedAt.toISOString() : null,
      },
      error: null,
    })
  } catch (err) {
    next(err)
  }
}

