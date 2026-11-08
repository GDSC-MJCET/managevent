import { z } from 'zod'

/** Contracts for the Live Doubts Board (AY-03). */

export const DOUBT_STATUSES = ['open', 'answered'] as const

export const createDoubtBody = z.object({
  text: z.string().trim().min(3).max(500),
})

export const moderateDoubtBody = z
  .object({
    answer: z.string().trim().min(1).max(2000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine(
    (body) => body.answer !== undefined || body.pinned !== undefined,
    'Send an answer or a pinned flag',
  )

export const listDoubtsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateDoubtBody = z.infer<typeof createDoubtBody>
export type ModerateDoubtBody = z.infer<typeof moderateDoubtBody>
export type ListDoubtsQuery = z.infer<typeof listDoubtsQuery>

/**
 * Sent to everyone in the room via doubt:new / doubt:update.
 * It has no per-viewer fields, so one payload is safe for the whole room.
 */
export const doubtBroadcastSchema = z.object({
  id: z.uuid(),
  event_id: z.uuid(),
  text: z.string(),
  status: z.enum(DOUBT_STATUSES),
  answer: z.string().nullable(),
  pinned: z.boolean(),
  votes: z.number().int(),
  created_at: z.string(),
})

/** Returned by REST: the broadcast fields plus what depends on who is asking. */
export const doubtViewSchema = doubtBroadcastSchema.extend({
  has_voted: z.boolean(),
  is_mine: z.boolean(),
  /** Only the owning club sees who asked. */
  author_name: z.string().nullable(),
})

export type DoubtBroadcast = z.infer<typeof doubtBroadcastSchema>
export type DoubtView = z.infer<typeof doubtViewSchema>