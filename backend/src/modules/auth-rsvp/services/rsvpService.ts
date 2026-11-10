import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import type {
  IRsvpTransitionService,
  RsvpTransitionParams,
  RsvpTransitionResult,
} from '../../attendee-ops/contracts/rsvpTransition.js'
import { prisma } from '../../../db/index.js'
import type { RsvpAnswers } from '../schema.js'

type Tx = Prisma.TransactionClient

interface RsvpCore {
  id: string
  eventId: string
  userId: string
  status: RsvpStatus
}

type RsvpStatus = 'pending' | 'approved' | 'rejected' | 'waitlist' | 'cancelled'

export interface TransitionResult {
  success: boolean
  rsvp?: {
    id: string
    eventId: string
    userId: string
    status: RsvpStatus
  }
  // Wider than the attendee-ops contract: Ali's own endpoints surface
  // ALREADY_RSVPED / EVENT_NOT_OPEN straight from the engine.
  error?: {
    code: 'EVENT_FULL' | 'CONFLICT' | 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_RSVPED' | 'EVENT_NOT_OPEN'
    message: string
  }
}

export interface CreateRsvpInput {
  eventId: string
  userId: string
  answers?: RsvpAnswers
  screenshotUrl?: string
}

/**
 * AL-05 / AL-07 — Ali's RSVP engine (BR-R10).
 *
 * The ONLY place in the app that writes `rsvps.status`. Capacity reads and the
 * event row lock (BR-R2) run inside the same transaction as the write.
 */
class RsvpService implements IRsvpTransitionService {
  async transition(params: RsvpTransitionParams): Promise<RsvpTransitionResult> {
    return prisma.$transaction(async (tx: Tx) => {
      const rsvp = await tx.rsvp.findUnique({
        where: { id: params.rsvpId },
        include: {
          event: { include: { club: true, settings: true } },
          payment: true,
        },
      })

      if (!rsvp) {
        return fail('NOT_FOUND', 'RSVP not found') as RsvpTransitionResult
      }

      const isOwner = rsvp.event.club.ownerId === params.actorId
      if (!isOwner) {
        const actor = await tx.user.findUnique({
          where: { id: params.actorId },
          select: { role: true },
        })
        if (actor?.role !== 'super_admin') {
          return fail('FORBIDDEN', 'Only the club owner can perform this action') as RsvpTransitionResult
        }
      }

      await lockEventRow(tx, rsvp.eventId)

      if (rsvp.status === 'cancelled') {
        // A cancelled RSVP is dead: only the student can revive it via a new RSVP.
        return fail(
          'CONFLICT',
          'This RSVP was cancelled and cannot be updated directly',
        ) as RsvpTransitionResult
      }

      // Operator transitions never hit the wider internal codes.
      const outcome = (await applyTransition(tx, rsvp, params)) as unknown as RsvpTransitionResult
      return outcome
    })
  }

  /**
   * Initial placement for a freshly created (or cancelled-and-reused) RSVP row.
   * - Paid event (BR-R5) or manual mode (BR-R4): stays `pending`.
   * - Free auto mode (BR-R3): `approved` while seats remain, else `waitlist`.
   * Use from outside an open transaction (ali's controller). For calls inside
   * one, use placeInitialInTx via createRsvp.
   */
  async placeInitial(rsvpId: string): Promise<TransitionResult> {
    return prisma.$transaction(async (tx: Tx) => {
      const rsvp = await tx.rsvp.findUnique({
        where: { id: rsvpId },
        include: { event: { include: { settings: true } } },
      })

      if (!rsvp) {
        return fail('NOT_FOUND', 'RSVP not found')
      }

      return placeInitialInTx(tx, rsvp.id, rsvp.event)
    })
  }

  /**
   * AL-08 — student cancels their own RSVP (BR-R7). Cancelling an approved RSVP
   * in auto mode promotes the oldest waitlisted RSVP (FIFO) in the same
   * transaction; paid events promote waitlisted users only when their payment
   * is already verified.
   */
  async cancel(
    rsvpId: string,
    actorId: string,
  ): Promise<TransitionResult & { promotedRsvpIds?: string[] }> {
    return prisma.$transaction(async (tx: Tx) => {
      const rsvp = await tx.rsvp.findUnique({
        where: { id: rsvpId },
        include: { event: { include: { club: true, settings: true } } },
      })

      if (!rsvp) {
        return fail('NOT_FOUND', 'RSVP not found')
      }

      if (rsvp.userId !== actorId) {
        return fail('FORBIDDEN', 'Only the RSVP owner can cancel it')
      }

      await lockEventRow(tx, rsvp.eventId)

      if (rsvp.status === 'cancelled') {
        return result(rsvp) // idempotent cancel
      }

      const wasApproved = rsvp.status === 'approved'
      const settings = rsvp.event.settings

      const updated = await tx.rsvp.update({
        where: { id: rsvp.id },
        data: { status: 'cancelled' },
      })

      let promotedRsvpIds: string[] = []
      if (wasApproved && settings?.approvalMode !== 'manual') {
        promotedRsvpIds = await promoteOldestEligible(tx, rsvp.eventId, settings ?? null)
      }

      return { ...result(updated), promotedRsvpIds }
    })
  }

  /**
   * AL-07 — creates the RSVP row (or revives a cancelled one, BR-R1) and places
   * it inside one locked transaction. BR-R1 checks (open event, one active RSVP
   * per user) are re-evaluated here so concurrent requests cannot race past them.
   */
  async createRsvp(input: CreateRsvpInput): Promise<TransitionResult> {
    return prisma.$transaction(async (tx: Tx) => {
      const event = await tx.event.findUnique({
        where: { id: input.eventId },
        include: { settings: true },
      })

      if (!event) {
        return fail('NOT_FOUND', 'Event not found')
      }

      if (event.status !== 'open') {
        return fail('EVENT_NOT_OPEN', 'RSVPs are closed for this event')
      }

      await lockEventRow(tx, input.eventId)

      const settings = event.settings
      const isPaid = settings?.isPaid ?? false
      if (isPaid && !input.screenshotUrl) {
        return fail('CONFLICT', 'A payment screenshot URL is required for paid events')
      }

      const existing = await tx.rsvp.findUnique({
        where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      })

      if (existing && existing.status !== 'cancelled') {
        return fail('ALREADY_RSVPED', 'You have already RSVPed to this event')
      }

      if (existing) {
        // BR-R1: re-RSVP after cancelling reuses the row.
        const reused = await tx.rsvp.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            answers: (input.answers as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
          },
        })
        if (isPaid) {
          await tx.payment.update({
            where: { rsvpId: reused.id },
            data: {
              screenshotUrl: input.screenshotUrl!,
              status: 'pending',
              rejectReason: null,
            },
          })
        }
        return placeInitialInTx(tx, reused.id, event as EventLike)
      }

      const created = await tx.rsvp.create({
        data: {
          id: randomUuid(),
          eventId: input.eventId,
          userId: input.userId,
          answers: (input.answers as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
          status: 'pending',
        },
      })
      if (isPaid) {
        await tx.payment.create({
          data: {
            id: randomUuid(),
            rsvpId: created.id,
            screenshotUrl: input.screenshotUrl!,
          },
        })
      }
      return placeInitialInTx(tx, created.id, event as EventLike)
    })
  }
}

// ── helpers: one definition point for capacity, placement and promotion rules ──

function randomUuid(): string {
  return crypto.randomUUID()
}

interface EventLike {
  settings: { approvalMode: string; isPaid: boolean; capacity: number } | null
}

async function lockEventRow(tx: Tx, eventId: string): Promise<void> {
  // BR-R2: row lock on the event so concurrent capacity checks cannot race.
  await tx.$queryRaw`SELECT 1 FROM "events" WHERE id = ${eventId}::uuid FOR UPDATE`
}

async function countApproved(tx: Tx, eventId: string): Promise<number> {
  return tx.rsvp.count({ where: { eventId, status: 'approved' } })
}

async function placeInitialInTx(tx: Tx, rsvpId: string, event: EventLike): Promise<TransitionResult> {
  const rsvp = await tx.rsvp.findUnique({ where: { id: rsvpId } })
  if (!rsvp) {
    return fail('NOT_FOUND', 'RSVP not found')
  }
  if (rsvp.status !== 'pending') {
    return result(rsvp)
  }
  const settings = event.settings
  if (settings?.isPaid || settings?.approvalMode === 'manual') {
    return result(rsvp) // stays pending: payment verification / club decides
  }
  const approvedCount = await countApproved(tx, rsvp.eventId)
  const capacity = settings?.capacity ?? null
  // BR-R3: free auto mode — approve while seats remain, else waitlist.
  const next =
    capacity != null && approvedCount >= capacity ? 'waitlist' : 'approved'
  const updated = await tx.rsvp.update({ where: { id: rsvpId }, data: { status: next } })
  return result(updated)
}

async function promoteOldestEligible(
  tx: Tx,
  eventId: string,
  settings: { approvalMode: string; isPaid: boolean; capacity: number } | null,
): Promise<string[]> {
  if (settings?.approvalMode === 'manual') return []

  const capacity = settings?.capacity
  const approvedCount = await countApproved(tx, eventId)
  if (capacity == null || approvedCount >= capacity) return []

  const isPaid = settings?.isPaid ?? false
  const waitlisted = await tx.rsvp.findMany({
    where: { eventId, status: 'waitlist' },
    orderBy: { createdAt: 'asc' },
    include: { payment: true },
  })

  // BR-R7: paid waitlisted users promote only if payment is already verified.
  const candidate = waitlisted.find((w) => !isPaid || w.payment?.status === 'verified')
  if (!candidate) return []

  await tx.rsvp.update({ where: { id: candidate.id }, data: { status: 'approved' } })
  return [candidate.id]
}

async function applyTransition(
  tx: Tx,
  rsvp: {
    id: string
    eventId: string
    userId: string
    status: RsvpStatus
    event: { club: { ownerId: string }; settings: EventLike['settings'] }
    payment: unknown
  },
  params: RsvpTransitionParams,
): Promise<TransitionResult> {
  switch (params.toStatus) {
    case 'approved':
      return transitionToApproved(tx, rsvp)
    case 'rejected':
      return setRsvpStatus(tx, rsvp, 'rejected')
    case 'waitlist':
      return setRsvpStatus(tx, rsvp, 'waitlist')
    case 'pending':
      return setRsvpStatus(tx, rsvp, 'pending')
    case 'payment_verified':
      return transitionPaymentVerified(tx, rsvp)
    case 'payment_rejected':
      // BR-R6: stays pending so the student can submit a fresh screenshot.
      return setRsvpStatus(tx, rsvp, 'pending')
    default: {
      const never: never = params.toStatus
      return fail('CONFLICT', `Unsupported transition target: ${String(never)}`)
    }
  }
}

async function transitionToApproved(
  tx: Tx,
  rsvp: { id: string; eventId: string; userId: string; status: RsvpStatus; event: EventLike & { club: { ownerId: string } } },
): Promise<TransitionResult> {
  if (rsvp.status === 'approved') {
    return result(rsvp) // idempotent
  }
  const capacity = rsvp.event.settings?.capacity ?? null
  // BR-R4: the club cannot approve past capacity.
  const approvedCount = await countApproved(tx, rsvp.eventId)
  if (capacity != null && approvedCount >= capacity) {
    return fail('EVENT_FULL', 'Event capacity reached')
  }
  return setRsvpStatus(tx, rsvp, 'approved')
}

async function transitionPaymentVerified(
  tx: Tx,
  rsvp: { id: string; eventId: string; userId: string; status: RsvpStatus; event: EventLike & { club: { ownerId: string } } },
): Promise<TransitionResult> {
  if (rsvp.status === 'approved') {
    return result(rsvp) // idempotent
  }
  if (rsvp.status !== 'pending') {
    return fail('CONFLICT', 'Only pending RSVPs can process payment verification')
  }

  const settings = rsvp.event.settings
  // BR-R5: manual mode keeps it pending until the club decides.
  if (settings?.approvalMode === 'manual') {
    return result(rsvp)
  }
  const capacity = settings?.capacity ?? null
  const next =
    capacity != null && (await countApproved(tx, rsvp.eventId)) >= capacity
      ? 'waitlist'
      : 'approved'
  const updated = await tx.rsvp.update({ where: { id: rsvp.id }, data: { status: next } })
  return result(updated)
}

async function setRsvpStatus(
  tx: Tx,
  rsvp: { id: string; eventId: string; userId: string; status: RsvpStatus },
  status: 'pending' | 'approved' | 'rejected' | 'waitlist',
): Promise<TransitionResult> {
  if (rsvp.status === status) return result(rsvp) // idempotent
  const updated = await tx.rsvp.update({ where: { id: rsvp.id }, data: { status } })
  return result(updated)
}

function result(rsvp: { id: string; eventId: string; userId: string; status: string }): TransitionResult {
  return {
    success: true,
    rsvp: {
      id: rsvp.id,
      eventId: rsvp.eventId,
      userId: rsvp.userId,
      status: rsvp.status as RsvpStatus,
    },
  }
}

function fail(
  code:
    | 'EVENT_FULL'
    | 'CONFLICT'
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'ALREADY_RSVPED'
    | 'EVENT_NOT_OPEN',
  message: string,
): TransitionResult {
  return { success: false, error: { code, message } }
}

export const rsvpService: RsvpService = new RsvpService()
