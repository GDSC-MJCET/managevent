import type { IRsvpTransitionService } from '../contracts/rsvpTransition.js'
import { ApiError } from '../../../lib/errors.js'

let currentService: IRsvpTransitionService | null = null

export function getRsvpTransitionService(): IRsvpTransitionService {
  if (!currentService) {
    throw new ApiError(
      'INTERNAL',
      'RSVP transition service is unavailable (blocked on Ali: AL-05 / AL-07). In unit tests, inject a test double via setRsvpTransitionService().',
    )
  }
  return currentService
}

export function setRsvpTransitionService(service: IRsvpTransitionService | null): void {
  currentService = service
}
