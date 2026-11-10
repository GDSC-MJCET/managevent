import 'dotenv/config'
import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
    // AL-04 fake-user mode: lets teammates build UI/live-room flows before auth lands.
    // Never enable in production. Accepts only 'true'/'1'.
    FAKE_CLIENT_AUTH: z
      .string()
      .optional()
      .transform((val) => val === 'true' || val === '1'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is required in production and must be at least 32 characters',
      })
    }
    if (data.NODE_ENV === 'production' && data.FAKE_CLIENT_AUTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FAKE_CLIENT_AUTH'],
        message: 'FAKE_CLIENT_AUTH must not be enabled in production',
      })
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables')
  console.error(z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export const allowedOrigins = env.CLIENT_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
