import { z } from 'zod'

export const RSVP_FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'checkbox'] as const
export type RsvpFieldType = (typeof RSVP_FIELD_TYPES)[number]

export const RsvpFormFieldInputSchema = z
  .object({
    label: z.string().min(1, 'Label is required').max(200, 'Label must be 200 characters or fewer'),
    type: z.enum(RSVP_FIELD_TYPES),
    required: z.boolean(),
    position: z.number().int().min(0, 'Position must be a non-negative integer'),
    options: z.array(z.string().min(1, 'Option cannot be blank')).optional(),
  })
  .superRefine((field, ctx) => {
    const isSelect = field.type === 'select'
    const isCheckbox = field.type === 'checkbox'

    if (isSelect) {
      if (!field.options || field.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: '"select" fields require at least 2 options',
        })
      }
    } else if (isCheckbox) {
      if (field.options !== undefined && field.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: '"checkbox" fields with options require at least 2 options',
        })
      }
    } else {
      if (field.options !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: `"${field.type}" fields do not support options`,
        })
      }
    }
  })

export type RsvpFormFieldInput = z.infer<typeof RsvpFormFieldInputSchema>

export const PutRsvpFormBodySchema = z.object({
  fields: z
    .array(RsvpFormFieldInputSchema)
    .max(20, 'A form may have at most 20 fields'),
})

export type PutRsvpFormBody = z.infer<typeof PutRsvpFormBodySchema>

export const RsvpFormFieldOutputSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  type: z.enum(RSVP_FIELD_TYPES),
  required: z.boolean(),
  position: z.number().int(),
  options: z.array(z.string()).nullable(),
})

export type RsvpFormFieldOutput = z.infer<typeof RsvpFormFieldOutputSchema>

export const GetRsvpFormDataSchema = z.object({
  eventId: z.string().uuid(),
  fields: z.array(RsvpFormFieldOutputSchema),
})

export type GetRsvpFormData = z.infer<typeof GetRsvpFormDataSchema>
