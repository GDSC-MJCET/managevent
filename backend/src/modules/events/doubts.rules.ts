import type { EventStatusValue } from './events.contracts.js'

/**
 * BR-L1 applied to the doubts board: the club owner always gets in; everyone
 * else needs an approved RSVP and the event must be live.
 * Drafts are invisible to non-owners (BR-E4), so they get NOT_FOUND.
 */
export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false
      code: 'NOT_FOUND' | 'NOT_APPROVED' | 'EVENT_NOT_OPEN'
      message: string
    }

export function decideDoubtAccess(input: {
  isOwner: boolean
  eventStatus: EventStatusValue
  isApproved: boolean
}): AccessDecision {
  if (input.isOwner) return { allowed: true }

  if (input.eventStatus === 'draft') {
    return { allowed: false, code: 'NOT_FOUND', message: 'Event not found' }
  }
  if (!input.isApproved) {
    return {
      allowed: false,
      code: 'NOT_APPROVED',
      message: 'Only approved attendees can use the doubts board',
    }
  }
  if (input.eventStatus !== 'live') {
    return {
      allowed: false,
      code: 'EVENT_NOT_OPEN',
      message: 'The doubts board is open only while the event is live',
    }
  }
  return { allowed: true }
}