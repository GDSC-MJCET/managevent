import { z } from 'zod'

// ── AN-01: Custom RSVP Form ──────────────────────────────────────────────────
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
    if (field.type === 'select' || field.type === 'checkbox') {
      if (!field.options || field.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: `"${field.type}" fields require at least 2 options`,
        })
      }
    } else {
      if (field.options !== undefined && field.options !== null) {
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

// ── AN-02: Attendee Operations ───────────────────────────────────────────────
export const RSVP_STATUSES = ['pending', 'approved', 'rejected', 'waitlist', 'cancelled'] as const
export type RsvpStatus = (typeof RSVP_STATUSES)[number]

export const GetEventRsvpsQuerySchema = z.object({
  status: z.enum(RSVP_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type GetEventRsvpsQuery = z.infer<typeof GetEventRsvpsQuerySchema>

export const PatchRsvpBodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'waitlist']),
  reason: z.string().max(500).optional(),
})

export type PatchRsvpBody = z.infer<typeof PatchRsvpBodySchema>

export const BulkApproveRsvpsBodySchema = z.object({
  rsvpIds: z.array(z.string().uuid()).min(1, 'Provide at least one RSVP ID').max(100, 'Maximum 100 RSVPs per bulk operation'),
})

export type BulkApproveRsvpsBody = z.infer<typeof BulkApproveRsvpsBodySchema>

// ── AN-03: Payment Verification ─────────────────────────────────────────────
export const PAYMENT_STATUSES = ['pending', 'verified', 'rejected'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const GetEventPaymentsQuerySchema = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type GetEventPaymentsQuery = z.infer<typeof GetEventPaymentsQuerySchema>

export const PatchPaymentBodySchema = z
  .object({
    status: z.enum(['verified', 'rejected']),
    rejectReason: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'rejected' && (!data.rejectReason || !data.rejectReason.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectReason'],
        message: 'Rejection reason is required when rejecting a payment',
      })
    }
  })

export type PatchPaymentBody = z.infer<typeof PatchPaymentBodySchema>

// ── AN-04: Event-Day Check-in & Operations ──────────────────────────────────
export const CheckinResultSchema = z.object({
  id: z.string().uuid(),
  rsvpId: z.string().uuid(),
  checkedInAt: z.string().datetime(),
  checkedInBy: z.string().uuid(),
})

export type CheckinResult = z.infer<typeof CheckinResultSchema>

export const EventOpsMetricsSchema = z.object({
  eventId: z.string().uuid(),
  registeredCount: z.number().int().min(0),
  approvedCount: z.number().int().min(0),
  checkedInCount: z.number().int().min(0),
})

export type EventOpsMetrics = z.infer<typeof EventOpsMetricsSchema>
