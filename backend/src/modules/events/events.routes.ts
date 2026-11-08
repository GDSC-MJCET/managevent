import { Router } from 'express'
import {
  changeStatusBody,
  createEventBody,
  idParams,
  listClubEventsQuery,
  listEventsQuery,
  updateEventBody,
} from './events.contracts.js'
import {
  changeStatus,
  createEvent,
  deleteEvent,
  getEvent,
  listClubEvents,
  listEvents,
  updateEvent,
} from './events.service.js'
import { getRequiredUser, getUser, optionalUser, requireUser } from './guards.js'
import { ok, parse } from './http.js'

/** Mounted at /api in app.ts. Express 5 forwards async errors to errorHandler. */
export const eventsRouter = Router()

eventsRouter.post('/events', requireUser, async (req, res) => {
  const body = parse(createEventBody, req.body)
  res.status(201).json(ok(await createEvent(getRequiredUser(res), body)))
})

eventsRouter.get('/events', optionalUser, async (req, res) => {
  const query = parse(listEventsQuery, req.query)
  res.json(ok(await listEvents(query)))
})

eventsRouter.get('/events/:id', optionalUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  res.json(ok(await getEvent(id, getUser(res))))
})

eventsRouter.patch('/events/:id', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  const body = parse(updateEventBody, req.body)
  res.json(ok(await updateEvent(id, getRequiredUser(res), body)))
})

eventsRouter.delete('/events/:id', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  res.json(ok(await deleteEvent(id, getRequiredUser(res))))
})

eventsRouter.patch('/events/:id/status', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  const { status } = parse(changeStatusBody, req.body)
  res.json(ok(await changeStatus(id, getRequiredUser(res), status)))
})

eventsRouter.get('/clubs/:id/events', optionalUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  const query = parse(listClubEventsQuery, req.query)
  res.json(ok(await listClubEvents(id, getUser(res), query)))
})