import { z } from 'zod'

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const UuidSchema = z
  .string()
  .trim()
  .regex(UUID_REGEX, 'Must be a valid UUID')

export const EventParamSchema = z.object({
  id: UuidSchema,
})

export const GalleryItemParamSchema = z.object({
  id: UuidSchema,
})

// ── AD-01: Bulk Create Gallery Schema ───────────────────────────────────────

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

// ── AD-01: Update Gallery (Captions & Positions) Schema ─────────────────────

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
          message: `Duplicate gallery item id "${item.id}" in update payload`,
        })
      } else if (item) {
        ids.add(item.id)
      }
    }
  })

export type PatchGalleryBody = z.infer<typeof PatchGalleryBodySchema>
