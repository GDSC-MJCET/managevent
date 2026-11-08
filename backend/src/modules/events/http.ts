import type { z } from 'zod'
import { ApiError } from '../../lib/errors.js'

/** Validates input with a zod schema and throws VALIDATION with a readable message. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.')
        return path ? `${path}: ${issue.message}` : issue.message
      })
      .join('; ')
    throw new ApiError('VALIDATION', message)
  }
  return result.data
}

/** The { ok, data, error } success envelope. */
export const ok = <T>(data: T) => ({ ok: true as const, data, error: null })