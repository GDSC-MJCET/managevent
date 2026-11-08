import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import type { AuthUser } from './guards.js'
import {
  PUBLIC_EVENT_STATUSES,
  type CreateEventBody,
  type EventCard,
  type EventDetail,
  type EventStatusValue,
  type ListClubEventsQuery,
  type ListEventsQuery,
  type Page,
  type UpdateEventBody,
} from './events.contracts.js'
import {
  assertCanOpen,
  assertCapacity,
  assertEventShape,
  assertTransition,
} from './events.rules.js'
import {
  eventInclude,
  serializeCard,
  serializeDetail,
  type EventWithRelations,
} from './events.serializer.js'

type RsvpReader = Pick<Prisma.TransactionClient, 'rsvp'>

/**
 * Read-only count of approved attendees (BR-E5).
 * This module never writes rsvps.status (BR-R10). If Ali exports a helper
 * for this count, swap it in here and nowhere else.
 */
async function approvedCount(db: RsvpReader, eventId: string): Promise<number> {
  return db.rsvp.count({ where: { eventId, status: 'approved' } })
}

async function approvedCounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map()
  const rows = await prisma.rsvp.groupBy({
    by: ['eventId'],
    where: { eventId: { in: eventIds }, status: 'approved' },
    _count: { _all: true },
  })
  return new Map(rows.map((row) => [row.eventId, row._count._all]))
}

async function toCards(events: EventWithRelations[]): Promise<EventCard[]> {
  const counts = await approvedCounts(events.map((e) => e.id))
  return events.map((e) => serializeCard(e, counts.get(e.id) ?? 0))
}

/**
 * Loads an event inside a transaction and checks ownership (BR-E1).
 * A draft is invisible to non-owners, so they get NOT_FOUND, not FORBIDDEN.
 * The FOR UPDATE row lock serialises with the RSVP engine, which locks the
 * same row (BR-R2), so capacity and status checks cannot race with approvals.
 */
async function loadOwnedEventLocked(
  tx: Prisma.TransactionClient,
  id: string,
  user: AuthUser,
): Promise<EventWithRelations> {
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${id}::uuid FOR UPDATE`

  const event = await tx.event.findUnique({ where: { id }, include: eventInclude })
  if (!event) throw new ApiError('NOT_FOUND', 'Event not found')

  const isOwner = event.club.ownerId === user.id
  if (!isOwner) {
    if (event.status === 'draft') throw new ApiError('NOT_FOUND', 'Event not found')
    throw new ApiError('FORBIDDEN', 'Only the club that owns this event can change it')
  }
  return event
}

// ---------- AY-01 ----------

export async function createEvent(user: AuthUser, body: CreateEventBody): Promise<EventDetail> {
  if (user.role !== 'club_admin') {
    throw new ApiError('FORBIDDEN', 'Only club admins can host events')
  }

  const club = await prisma.club.findUnique({ where: { ownerId: user.id } })
  if (!club) throw new ApiError('FORBIDDEN', 'Register your club before hosting events')
  if (club.status !== 'approved') {
    throw new ApiError('FORBIDDEN', 'Your club must be approved before it can host events')
  }

  const startsAt = new Date(body.starts_at)
  const endsAt = new Date(body.ends_at)
  const price = body.price ?? null
  assertEventShape({ startsAt, endsAt, isPaid: body.is_paid, price })

  const event = await prisma.event.create({
    data: {
      clubId: club.id,
      title: body.title,
      description: body.description,
      bannerUrl: body.banner_url ?? null,
      venue: body.venue,
      startsAt,
      endsAt,
      settings: {
        create: {
          capacity: body.capacity,
          approvalMode: body.approval_mode,
          isPaid: body.is_paid,
          price,
          qrUrl: body.qr_url ?? null,
        },
      },
    },
    include: eventInclude,
  })

  return serializeDetail(event, 0, true)
}

export async function listEvents(query: ListEventsQuery): Promise<Page<EventCard>> {
  // BR-E4 + BR-C1: the public feed never shows drafts or unapproved clubs.
  const and: Prisma.EventWhereInput[] = [
    { status: { in: [...PUBLIC_EVENT_STATUSES] } },
    { club: { status: 'approved' } },
  ]
  if (query.club) and.push({ clubId: query.club })
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ],
    })
  }
  if (query.from) and.push({ startsAt: { gte: new Date(query.from) } })
  if (query.to) and.push({ startsAt: { lte: new Date(query.to) } })
  if (query.paid !== undefined) and.push({ settings: { is: { isPaid: query.paid } } })

  const where: Prisma.EventWhereInput = { AND: and }

  const [events, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: eventInclude,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.event.count({ where }),
  ])

  return { items: await toCards(events), page: query.page, limit: query.limit, total }
}

export async function getEvent(id: string, user: AuthUser | null): Promise<EventDetail> {
  const event = await prisma.event.findUnique({ where: { id }, include: eventInclude })
  if (!event) throw new ApiError('NOT_FOUND', 'Event not found')

  const isOwner = user !== null && event.club.ownerId === user.id
  const hidden = event.status === 'draft' || event.club.status !== 'approved'
  if (hidden && !isOwner) throw new ApiError('NOT_FOUND', 'Event not found')

  return serializeDetail(event, await approvedCount(prisma, id), isOwner)
}

export async function updateEvent(
  id: string,
  user: AuthUser,
  body: UpdateEventBody,
): Promise<EventDetail> {
  return prisma.$transaction(async (tx) => {
    const event = await loadOwnedEventLocked(tx, id, user)
    const settings = event.settings
    if (!settings) throw new ApiError('INTERNAL', 'Event settings are missing')

    const approved = await approvedCount(tx, id)

    const capacity = body.capacity ?? settings.capacity
    if (body.capacity !== undefined) assertCapacity(capacity, approved) // BR-E3

    const startsAt = body.starts_at ? new Date(body.starts_at) : event.startsAt
    const endsAt = body.ends_at ? new Date(body.ends_at) : event.endsAt
    const isPaid = body.is_paid ?? settings.isPaid
    const price =
      body.price !== undefined ? body.price : isPaid ? (settings.price?.toNumber() ?? null) : null
    const qrUrl = body.qr_url !== undefined ? body.qr_url : settings.qrUrl

    assertEventShape({ startsAt, endsAt, isPaid, price })

    // Once an event is no longer a draft, edits must not bypass BR-E2.
    if (event.status !== 'draft') assertCanOpen({ isPaid, qrUrl })

    const data: Prisma.EventUpdateInput = {
      settings: {
        update: {
          capacity,
          approvalMode: body.approval_mode ?? settings.approvalMode,
          isPaid,
          price,
          qrUrl,
        },
      },
    }
    if (body.title !== undefined) data.title = body.title
    if (body.description !== undefined) data.description = body.description
    if (body.banner_url !== undefined) data.bannerUrl = body.banner_url
    if (body.venue !== undefined) data.venue = body.venue
    if (body.starts_at !== undefined) data.startsAt = startsAt
    if (body.ends_at !== undefined) data.endsAt = endsAt

    const updated = await tx.event.update({ where: { id }, data, include: eventInclude })
    return serializeDetail(updated, approved, true)
  })
}

export async function deleteEvent(id: string, user: AuthUser): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const event = await loadOwnedEventLocked(tx, id, user)
    if (event.status !== 'draft') {
      throw new ApiError('CONFLICT', 'Only draft events can be deleted')
    }
    await tx.event.delete({ where: { id } })
    return { id }
  })
}

// ---------- AY-02 ----------

export async function changeStatus(
  id: string,
  user: AuthUser,
  to: EventStatusValue,
): Promise<EventDetail> {
  return prisma.$transaction(async (tx) => {
    const event = await loadOwnedEventLocked(tx, id, user)
    const settings = event.settings
    if (!settings) throw new ApiError('INTERNAL', 'Event settings are missing')

    assertTransition(event.status, to) // BR-E1
    if (to === 'open') assertCanOpen(settings) // BR-E2

    const updated = await tx.event.update({
      where: { id },
      data: { status: to },
      include: eventInclude,
    })
    return serializeDetail(updated, await approvedCount(tx, id), true)
  })
}

export async function listClubEvents(
  clubId: string,
  user: AuthUser | null,
  query: ListClubEventsQuery,
): Promise<Page<EventCard>> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { ownerId: true, status: true },
  })
  const isOwner = club !== null && user !== null && club.ownerId === user.id
  if (!club || (club.status !== 'approved' && !isOwner)) {
    throw new ApiError('NOT_FOUND', 'Club not found')
  }

  let statusFilter: Prisma.EventWhereInput['status']
  if (query.status) {
    if (query.status === 'draft' && !isOwner) {
      throw new ApiError('FORBIDDEN', 'Draft events are only visible to the club')
    }
    statusFilter = query.status
  } else if (!isOwner) {
    statusFilter = { in: [...PUBLIC_EVENT_STATUSES] }
  }

  const where: Prisma.EventWhereInput = { clubId, status: statusFilter }

  const [events, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: eventInclude,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.event.count({ where }),
  ])

  return { items: await toCards(events), page: query.page, limit: query.limit, total }
}