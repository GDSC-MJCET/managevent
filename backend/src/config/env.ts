import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
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
