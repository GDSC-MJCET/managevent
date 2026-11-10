import cors from 'cors'
import express from 'express'
import { allowedOrigins, env } from './config/env.js'
import { prisma } from './db/index.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'

import { attendeeOpsRouter } from './modules/attendee-ops/router.js'
import { authRsvpRouter } from './modules/auth-rsvp/router.js'
import { setRsvpTransitionService } from './modules/attendee-ops/services/rsvpTransitionProvider.js'
import { rsvpService } from './modules/auth-rsvp/services/rsvpService.js'

// AL-05/AL-07: Ali's RSVP engine is registered so Anas's attendee-ops
// endpoints can call rsvpService.transition() at runtime (BR-R10).
setRsvpTransitionService(rsvpService)

export const app = express()

app.disable('x-powered-by')

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    res.json({
      ok: true,
      data: {
        status: 'ok',
        database: 'up',
        environment: env.NODE_ENV,
        uptime: Math.round(process.uptime()),
      },
      error: null,
    })
  } catch {
    res.status(503).json({
      ok: false,
      data: null,
      error: { code: 'INTERNAL', message: 'Database is not reachable' },
    })
  }
})

app.use('/api', authRsvpRouter)
app.use('/api', attendeeOpsRouter)

app.use(notFoundHandler)
app.use(errorHandler)

