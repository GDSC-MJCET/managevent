import { z } from 'zod'

// ── AL-03: Auth ──────────────────────────────────────────────────────────────

export const SignupBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  email: z.string().trim().toLowerCase().email('a valid email is required'),
  password: z.string().min(8, 'password must be at least 8 characters').max(72),
  // Signup can never create a super_admin: role is accepted and discarded so
  // the endpoint always creates a student.
  role: z.string().optional(),
})
export type SignupBody = z.infer<typeof SignupBodySchema>

export const LoginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('a valid email is required'),
  password: z.string().min(1, 'password is required'),
})
export type LoginBody = z.infer<typeof LoginBodySchema>

// ── AL-06: Profile and password ──────────────────────────────────────────────

export const UpdateProfileBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    rollNumber: z.string().trim().min(1).max(20).nullish(),
    branch: z.string().trim().min(1).max(50).nullish(),
    year: z.number().int().min(1).max(5).nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'body must not be empty' })
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword is required'),
  newPassword: z.string().min(8, 'newPassword must be at least 8 characters').max(72),
})
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>

export const ForgotPasswordBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('a valid email is required'),
})
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1, 'reset token is required'),
  newPassword: z.string().min(8, 'newPassword must be at least 8 characters').max(72),
})
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>

// ── AL-07: RSVP submission ───────────────────────────────────────────────────

// Answers keyed by the label of each Anas rsvp_form_field. Extra keys (profile
// details collected client-side) are allowed and stored as-is.
export const RsvpAnswersSchema = z.record(z.string(), z.unknown())
export type RsvpAnswers = z.infer<typeof RsvpAnswersSchema>

export const SubmitRsvpBodySchema = z.object({
  answers: RsvpAnswersSchema.optional(),
  // Required only when the event is paid (BR-R5); URL comes from POST /api/uploads.
  screenshotUrl: z.string().trim().min(1).url().optional(),
})
export type SubmitRsvpBody = z.infer<typeof SubmitRsvpBodySchema>

// ── AL-08: my-RSVPs pagination query ────────────────────────────────────────

export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

