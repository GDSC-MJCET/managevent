import { z } from 'zod'

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const UuidSchema = z
  .string()
  .trim()
  .regex(UUID_REGEX, 'Must be a valid UUID')

// ── AD-02: Certificate Assignment Schemas ───────────────────────────────────

export const CertificateAssignmentItemSchema = z.object({
  user_id: UuidSchema,
  file_url: z
    .string()
    .trim()
    .url('file_url must be a valid URL')
    .min(1, 'file_url cannot be empty'),
})

export type CertificateAssignmentItem = z.infer<typeof CertificateAssignmentItemSchema>

/**
 * Assign Certificate Body:
 * Supports assigning a single certificate ({ user_id, file_url })
 * or multiple certificates ({ assignments: [...] }).
 */
export const AssignCertificateBodySchema = z
  .object({
    user_id: UuidSchema.optional(),
    file_url: z.string().trim().url('file_url must be a valid URL').optional(),
    assignments: z.array(CertificateAssignmentItemSchema).min(1).max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const hasSingle = Boolean(data.user_id && data.file_url)
    const hasBatch = Boolean(data.assignments && data.assignments.length > 0)

    if (!hasSingle && !hasBatch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['user_id'],
        message: 'Must provide either user_id & file_url or an assignments array',
      })
      return
    }

    if (data.assignments && data.assignments.length > 0) {
      const seen = new Set<string>()
      for (let i = 0; i < data.assignments.length; i++) {
        const item = data.assignments[i]
        if (item && seen.has(item.user_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['assignments', i, 'user_id'],
            message: `Duplicate user_id "${item.user_id}" in assignments payload`,
          })
        } else if (item) {
          seen.add(item.user_id)
        }
      }
    }
  })

export type AssignCertificateBody = z.infer<typeof AssignCertificateBodySchema>

// ── AD-02: Certificate Output Models ────────────────────────────────────────

export const CertificateResponseSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  user_id: z.string().uuid(),
  file_url: z.string().url(),
  issued_at: z.string().datetime(),
  event: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      banner_url: z.string().nullable().optional(),
      venue: z.string().optional(),
      starts_at: z.string().datetime().optional(),
      ends_at: z.string().datetime().optional(),
    })
    .optional(),
  user: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().email(),
      roll_number: z.string().nullable().optional(),
    })
    .optional(),
})

export type CertificateResponse = z.infer<typeof CertificateResponseSchema>

// ── AD-02: Standard API Response Types ──────────────────────────────────────

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
