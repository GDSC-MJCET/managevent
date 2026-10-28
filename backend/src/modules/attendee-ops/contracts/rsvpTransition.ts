/**
 * rsvpTransition contract — shared interface for Ali's RSVP transition engine (AL-05 / AL-07).
 *
 * Owner: Ali (auth-rsvp)
 * Consumer: Anas (attendee-ops)
 *
 * Per BR-R10: "All rsvps.status writes go through rsvpService.transition()."
 * Supported transition targets:
 * - 'approved' | 'rejected' | 'waitlist': Direct transitions from club attendee ops (AN-02)
 * - 'payment_verified': Triggered by payment verification (AN-03 / BR-R5).
 *   Ali's engine evaluates event approval mode and capacity:
 *   - Auto mode (auto_until_full): moves to 'approved' if capacity remains, otherwise 'waitlist'.
 *   - Manual mode (manual): remains in 'pending' until the club explicitly decides.
 * - 'payment_rejected': Triggered by payment rejection with reason (AN-03 / BR-R6).
 *   Leaves RSVP in 'pending' so student can resubmit payment screenshot.
 * - 'pending': For compensation rollback if subsequent payment updates fail.
 */

export type RsvpTransitionTarget =
  | 'approved'
  | 'rejected'
  | 'waitlist'
  | 'pending'
  | 'payment_verified'
  | 'payment_rejected'

export interface RsvpTransitionParams {
  rsvpId: string
  toStatus: RsvpTransitionTarget
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
