import type { Prisma } from '@prisma/client'
import { ApiError } from '../../lib/errors.js'
import type { EventCard, EventDetail } from './events.contracts.js'
import { calcSeatsLeft } from './events.rules.js'

export const eventInclude = {
  settings: true,
  club: { select: { id: true, name: true, logoUrl: true, ownerId: true, status: true } },
} satisfies Prisma.EventInclude

export type EventWithRelations = Prisma.EventGetPayload<{ include: typeof eventInclude }>

export function serializeCard(event: EventWithRelations, approvedCount: number): EventCard {
  const settings = event.settings
  if (!settings) throw new ApiError('INTERNAL', 'Event settings are missing')

  return {
    id: event.id,
    club: { id: event.club.id, name: event.club.name, logo_url: event.club.logoUrl },
    title: event.title,
    banner_url: event.bannerUrl,
    venue: event.venue,
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt.toISOString(),
    status: event.status,
    is_paid: settings.isPaid,
    price: settings.price?.toNumber() ?? null,
    capacity: settings.capacity,
    seats_left: calcSeatsLeft(settings.capacity, approvedCount),
  }
}

export function serializeDetail(
  event: EventWithRelations,
  approvedCount: number,
  isOwner: boolean,
): EventDetail {
  const settings = event.settings
  if (!settings) throw new ApiError('INTERNAL', 'Event settings are missing')

  return {
    ...serializeCard(event, approvedCount),
    description: event.description,
    approval_mode: settings.approvalMode,
    qr_url: settings.qrUrl,
    created_at: event.createdAt.toISOString(),
    is_owner: isOwner,
  }
}