import type { DoubtBroadcast } from './doubts.contracts.js'

/**
 * TEMPORARY adapter for Amar's socket gateway (AM-01), which is not in the repo yet.
 * When it lands, delete the local no-op below and import the real function:
 *   import { emitToRoom } from '../../sockets/index.js'   // path to be confirmed
 * Nothing else in the Events module needs to change.
 */
function emitToRoom(_eventId: string, _name: string, _payload: unknown): void {
  // no-op until AM-01 ships
}

export type DoubtEventName = 'doubt:new' | 'doubt:update'

/** A socket failure must never fail the HTTP request, the data is already saved. */
export function emitDoubtEvent(eventId: string, name: DoubtEventName, payload: DoubtBroadcast): void {
  try {
    emitToRoom(eventId, name, payload)
  } catch (error) {
    console.error(`Failed to emit ${name}`, error)
  }
}