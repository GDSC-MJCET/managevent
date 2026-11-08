import { ApiError } from '../../lib/errors.js'
import { PUBLIC_EVENT_STATUSES, type EventStatusValue } from './events.contracts.js'

/** Pure business rules. No database access, so they are cheap to unit test. */

const NEXT_STATUS: Record<EventStatusValue, EventStatusValue | null> = {
  draft: 'open',
  open: 'live',
  live: 'ended',
  ended: null,
}

/** BR-E1: forward only, one step at a time. */
export function assertTransition(from: EventStatusValue, to: EventStatusValue): void {
  if (NEXT_STATUS[from] !== to) {
    throw new ApiError('CONFLICT', `An event cannot move from ${from} to ${to}`)
  }
}

/** BR-E2: a paid event cannot open (or stay open) without a payment QR. */
export function assertCanOpen(settings: { isPaid: boolean; qrUrl: string | null }): void {
  if (settings.isPaid && !settings.qrUrl) {
    throw new ApiError('QR_REQUIRED', 'Add a payment QR code before opening a paid event')
  }
}

/** BR-E3: capacity cannot drop below the approved attendees. */
export function assertCapacity(newCapacity: number, approvedCount: number): void {
  if (newCapacity < approvedCount) {
    throw new ApiError(
      'CAPACITY_BELOW_APPROVED',
      `Capacity cannot be lower than the ${approvedCount} approved attendees`,
    )
  }
}

/** BR-E5: computed, never stored. */
export function calcSeatsLeft(capacity: number, approvedCount: number): number {
  return Math.max(0, capacity - approvedCount)
}

/** BR-E4: students only see these statuses. */
export function isPublicStatus(status: EventStatusValue): boolean {
  return (PUBLIC_EVENT_STATUSES as readonly string[]).includes(status)
}

/** Cross-field checks on the final (merged) event, used by create and update. */
export function assertEventShape(shape: {
  startsAt: Date
  endsAt: Date
  isPaid: boolean
  price: number | null
}): void {
  if (shape.endsAt.getTime() <= shape.startsAt.getTime()) {
    throw new ApiError('VALIDATION', 'ends_at: must be after starts_at')
  }
  if (shape.isPaid && shape.price === null) {
    throw new ApiError('VALIDATION', 'price: required for a paid event')
  }
  if (!shape.isPaid && shape.price !== null) {
    throw new ApiError('VALIDATION', 'price: only allowed when the event is paid')
  }
}