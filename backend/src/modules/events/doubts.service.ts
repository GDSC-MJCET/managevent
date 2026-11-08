import { Prisma } from '@prisma/client'
import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import type {
  CreateDoubtBody,
  DoubtView,
  ListDoubtsQuery,
  ModerateDoubtBody,
} from './doubts.contracts.js'
import { decideDoubtAccess } from './doubts.rules.js'
import { doubtInclude, toBroadcast, toView } from './doubts.serializer.js'
import type { Page } from './events.contracts.js'
import type { AuthUser } from './guards.js'
import { emitDoubtEvent } from './realtime.js'

/**
 * Read-only check of an approved RSVP (BR-L1). This module never writes
 * rsvps.status (BR-R10). When Ali's requireApprovedAttendee lands, use it here.
 */
async function isApprovedAttendee(userId: string, eventId: string): Promise<boolean> {
  const rsvp = await prisma.rsvp.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { status: true },
  })
  return rsvp?.status === 'approved'
}

async function requireParticipation(
  eventId: string,
  user: AuthUser,
): Promise<{ isOwner: boolean }> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, club: { select: { ownerId: true } } },
  })
  if (!event) throw new ApiError('NOT_FOUND', 'Event not found')

  const isOwner = event.club.ownerId === user.id
  const isApproved = isOwner ? false : await isApprovedAttendee(user.id, event.id)

  const decision = decideDoubtAccess({ isOwner, eventStatus: event.status, isApproved })
  if (!decision.allowed) throw new ApiError(decision.code, decision.message)
  return { isOwner }
}

async function votedIds(userId: string, doubtIds: string[]): Promise<Set<string>> {
  if (doubtIds.length === 0) return new Set()
  const votes = await prisma.doubtVote.findMany({
    where: { userId, doubtId: { in: doubtIds } },
    select: { doubtId: true },
  })
  return new Set(votes.map((vote) => vote.doubtId))
}

async function loadDoubt(id: string) {
  return prisma.doubt.findUniqueOrThrow({ where: { id }, include: doubtInclude })
}

export async function createDoubt(
  eventId: string,
  user: AuthUser,
  body: CreateDoubtBody,
): Promise<DoubtView> {
  const { isOwner } = await requireParticipation(eventId, user)

  const doubt = await prisma.doubt.create({
    data: { eventId, userId: user.id, text: body.text },
    include: doubtInclude,
  })

  emitDoubtEvent(eventId, 'doubt:new', toBroadcast(doubt))
  return toView(doubt, { isOwner, userId: user.id, hasVoted: false })
}

export async function listDoubts(
  eventId: string,
  user: AuthUser,
  query: ListDoubtsQuery,
): Promise<Page<DoubtView>> {
  const { isOwner } = await requireParticipation(eventId, user)

  const where: Prisma.DoubtWhereInput = { eventId }

  // Pinned first, then most votes, then newest.
  const [doubts, total] = await prisma.$transaction([
    prisma.doubt.findMany({
      where,
      include: doubtInclude,
      orderBy: [
        { pinned: 'desc' },
        { votes: { _count: 'desc' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.doubt.count({ where }),
  ])

  const voted = await votedIds(
    user.id,
    doubts.map((d) => d.id),
  )

  return {
    items: doubts.map((d) => toView(d, { isOwner, userId: user.id, hasVoted: voted.has(d.id) })),
    page: query.page,
    limit: query.limit,
    total,
  }
}

export async function voteDoubt(doubtId: string, user: AuthUser): Promise<DoubtView> {
  const doubt = await prisma.doubt.findUnique({
    where: { id: doubtId },
    select: { id: true, eventId: true },
  })
  if (!doubt) throw new ApiError('NOT_FOUND', 'Doubt not found')

  const { isOwner } = await requireParticipation(doubt.eventId, user)

  // BR-L6: the (doubt_id, user_id) primary key enforces one vote per user.
  try {
    await prisma.doubtVote.create({ data: { doubtId, userId: user.id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError('CONFLICT', 'You have already voted for this doubt')
    }
    throw error
  }

  const updated = await loadDoubt(doubtId)
  emitDoubtEvent(doubt.eventId, 'doubt:update', toBroadcast(updated))
  return toView(updated, { isOwner, userId: user.id, hasVoted: true })
}

export async function moderateDoubt(
  doubtId: string,
  user: AuthUser,
  body: ModerateDoubtBody,
): Promise<DoubtView> {
  const doubt = await prisma.doubt.findUnique({
    where: { id: doubtId },
    select: { id: true, eventId: true, event: { select: { club: { select: { ownerId: true } } } } },
  })
  if (!doubt) throw new ApiError('NOT_FOUND', 'Doubt not found')

  // BR-L7: only the owning club answers or pins.
  if (doubt.event.club.ownerId !== user.id) {
    throw new ApiError('FORBIDDEN', 'Only the club that owns this event can answer or pin doubts')
  }

  const data: Prisma.DoubtUpdateInput = {}
  if (body.answer !== undefined) {
    data.answer = body.answer
    data.status = 'answered'
  }
  if (body.pinned !== undefined) data.pinned = body.pinned

  const updated = await prisma.doubt.update({
    where: { id: doubtId },
    data,
    include: doubtInclude,
  })

  emitDoubtEvent(doubt.eventId, 'doubt:update', toBroadcast(updated))

  const voted = await votedIds(user.id, [doubtId])
  return toView(updated, { isOwner: true, userId: user.id, hasVoted: voted.has(doubtId) })
}