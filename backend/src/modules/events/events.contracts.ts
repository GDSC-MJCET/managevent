import { z } from 'zod'

/**
 * Contracts for the Events module (AY-01, AY-02).
 * Request bodies, query strings and response shapes live here so the
 * client can import the same schemas later.
 * TODO: move to shared/contracts/events.ts once the team confirms where `shared/` lives.
 */

export const EVENT_STATUSES = ['draft', 'open', 'live', 'ended'] as const
export const PUBLIC_EVENT_STATUSES = ['open', 'live', 'ended'] as const
export const APPROVAL_MODES = ['auto_until_full', 'manual'] as const

export type EventStatusValue = (typeof EVENT_STATUSES)[number]

const isoDateTime = z.iso.datetime({ offset: true })

const price = z
  .number()
  .positive()
  .max(100_000)
  .refine((v) => Math.round(v * 100) / 100 === v, 'Price can have at most 2 decimal places')

// ---------- Requests ----------

export const idParams = z.object({ id: z.uuid() })

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const listEventsQuery = paginationQuery
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    club: z.uuid().optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    paid: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), {
    message: 'from must not be after to',
    path: ['from'],
  })

export const listClubEventsQuery = paginationQuery.extend({
  status: z.enum(EVENT_STATUSES).optional(),
})

const eventFields = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(1).max(5000),
  banner_url: z.url().nullish(),
  venue: z.string().trim().min(1).max(200),
  starts_at: isoDateTime,
  ends_at: isoDateTime,
  capacity: z.number().int().min(1).max(100_000),
  approval_mode: z.enum(APPROVAL_MODES),
  is_paid: z.boolean(),
  price: price.nullish(),
  qr_url: z.url().nullish(),
})

export const createEventBody = eventFields.extend({
  approval_mode: z.enum(APPROVAL_MODES).default('auto_until_full'),
  is_paid: z.boolean().default(false),
})

export const updateEventBody = eventFields
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to update')

export const changeStatusBody = z.object({ status: z.enum(EVENT_STATUSES) })

export type CreateEventBody = z.infer<typeof createEventBody>
export type UpdateEventBody = z.infer<typeof updateEventBody>
export type ListEventsQuery = z.infer<typeof listEventsQuery>
export type ListClubEventsQuery = z.infer<typeof listClubEventsQuery>

// ---------- Responses ----------

const clubSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  logo_url: z.string().nullable(),
})

export const eventCardSchema = z.object({
  id: z.uuid(),
  club: clubSummary,
  title: z.string(),
  banner_url: z.string().nullable(),
  venue: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.enum(EVENT_STATUSES),
  is_paid: z.boolean(),
  price: z.number().nullable(),
  capacity: z.number().int(),
  seats_left: z.number().int(),
})

export const eventDetailSchema = eventCardSchema.extend({
  description: z.string(),
  approval_mode: z.enum(APPROVAL_MODES),
  qr_url: z.string().nullable(),
  created_at: z.string(),
  is_owner: z.boolean(),
})

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  })

export type EventCard = z.infer<typeof eventCardSchema>
export type EventDetail = z.infer<typeof eventDetailSchema>
export type Page<T> = { items: T[]; page: number; limit: number; total: number }