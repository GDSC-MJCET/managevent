import { z } from 'zod'

// UUID regex helper
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const UuidSchema = z
  .string()
  .trim()
  .regex(UUID_REGEX, 'Must be a valid UUID')

// ── AD-01: Bulk Gallery Item Creation ───────────────────────────────────────

export const CreateGalleryItemInputSchema = z.object({
  file_url: z
    .string()
    .trim()
    .url('file_url must be a valid URL')
    .min(1, 'file_url cannot be empty'),
  caption: z
    .string()
    .trim()
    .max(500, 'Caption must be 500 characters or fewer')
    .nullable()
    .optional(),
  position: z
    .number()
    .int('Position must be an integer')
    .min(0, 'Position must be a non-negative integer'),
})

export type CreateGalleryItemInput = z.infer<typeof CreateGalleryItemInputSchema>

export const BulkCreateGalleryBodySchema = z.object({
  items: z
    .array(CreateGalleryItemInputSchema)
    .min(1, 'At least one gallery item is required')
    .max(100, 'Cannot upload more than 100 gallery items at once'),
})

export type BulkCreateGalleryBody = z.infer<typeof BulkCreateGalleryBodySchema>

// ── AD-01: Gallery Patch (Captions and Ordering) ─────────────────────────────

export const UpdateGalleryItemInputSchema = z
  .object({
    id: UuidSchema,
    caption: z
      .string()
      .trim()
      .max(500, 'Caption must be 500 characters or fewer')
      .nullable()
      .optional(),
    position: z
      .number()
      .int('Position must be an integer')
      .min(0, 'Position must be a non-negative integer')
      .optional(),
  })
  .refine(
    (data) => data.caption !== undefined || data.position !== undefined,
    {
      message: 'At least one of caption or position must be provided for update',
    },
  )

export type UpdateGalleryItemInput = z.infer<typeof UpdateGalleryItemInputSchema>

export const PatchGalleryBodySchema = z
  .object({
    items: z
      .array(UpdateGalleryItemInputSchema)
      .min(1, 'At least one gallery item update is required')
      .max(100, 'Cannot update more than 100 gallery items at once'),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>()
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      if (item && ids.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', i, 'id'],
          message: `Duplicate item id "${item.id}" in update request`,
        })
      } else if (item) {
        ids.add(item.id)
      }
    }
  })

export type PatchGalleryBody = z.infer<typeof PatchGalleryBodySchema>

// ── AD-01: Gallery Item Output Model ────────────────────────────────────────

export const GalleryItemResponseSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  file_url: z.string().url(),
  caption: z.string().nullable(),
  position: z.number().int(),
})

export type GalleryItemResponse = z.infer<typeof GalleryItemResponseSchema>

// ── AD-01: Standard API Response Types ──────────────────────────────────────

export interface ApiResponse<T> {
  ok: true
  data: T
  error: null
}

export interface ApiErrorResponse {
  ok: false
  data: null
  error: {
    code: string
    message: string
  }
}
