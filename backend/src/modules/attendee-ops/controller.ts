import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import { parseOptionalAuth } from '../../middleware/auth.js'
import type { PutRsvpFormBody, RsvpFormFieldInput } from './schema.js'

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
