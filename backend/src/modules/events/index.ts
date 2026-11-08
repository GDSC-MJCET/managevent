import { Router } from 'express'
import { doubtsRouter } from './doubts.routes.js'
import { eventsRouter } from './events.routes.js'

/** The one router app.ts mounts: app.use('/api', eventsModuleRouter) */
export const eventsModuleRouter = Router()
eventsModuleRouter.use(eventsRouter)
eventsModuleRouter.use(doubtsRouter)