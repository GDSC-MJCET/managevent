import { z } from 'zod'

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const UuidSchema = z
  .string()
  .trim()
  .regex(UUID_REGEX, 'Must be a valid UUID')

export const EventParamSchema = z.object({
  id: UuidSchema,
})

// ── AD-02: Certificate Assignment Input Schemas ─────────────────────────────

export const CertificateAssignmentItemSchema = z.object({
  user_id: UuidSchema,
  file_url: z
    .string()
    .trim()
    .url('file_url must be a valid URL')
    .min(1, 'file_url cannot be empty'),
})

export type CertificateAssignmentItem = z.infer<typeof CertificateAssignmentItemSchema>

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
