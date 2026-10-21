/**
 * rsvpTransition contract — shared interface for Ali's RSVP transition engine (AL-05 / AL-07).
 *
 * Owner: Ali (auth-rsvp)
 * Consumer: Anas (attendee-ops)
 *
 * Per BR-R10: "All rsvps.status writes go through rsvpService.transition()."
 * Anas's attendee-ops module never directly writes rsvps.status.
 */

export interface RsvpTransitionParams {
  rsvpId: string
  toStatus: 'approved' | 'rejected' | 'waitlist'
  actorId: string
  reason?: string
}

export interface RsvpTransitionResult {
  success: boolean
  rsvp?: {
    id: string
    eventId: string
    userId: string
    status: 'pending' | 'approved' | 'rejected' | 'waitlist' | 'cancelled'
  }
  error?: {
    code: 'EVENT_FULL' | 'CONFLICT' | 'NOT_FOUND' | 'FORBIDDEN'
    message: string
  }
}

export interface IRsvpTransitionService {
  transition(params: RsvpTransitionParams): Promise<RsvpTransitionResult>
}
