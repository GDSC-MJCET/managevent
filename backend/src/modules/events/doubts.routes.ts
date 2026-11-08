import { Router } from 'express'
import { createDoubtBody, listDoubtsQuery, moderateDoubtBody } from './doubts.contracts.js'
import { createDoubt, listDoubts, moderateDoubt, voteDoubt } from './doubts.service.js'
import { idParams } from './events.contracts.js'
import { getRequiredUser, requireUser } from './guards.js'
import { ok, parse } from './http.js'

/** Mounted at /api through the module router in index.ts. */
export const doubtsRouter = Router()

doubtsRouter.post('/events/:id/doubts', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  const body = parse(createDoubtBody, req.body)
  res.status(201).json(ok(await createDoubt(id, getRequiredUser(res), body)))
})

doubtsRouter.get('/events/:id/doubts', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  const query = parse(listDoubtsQuery, req.query)
  res.json(ok(await listDoubts(id, getRequiredUser(res), query)))
})

doubtsRouter.post('/doubts/:id/vote', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  res.json(ok(await voteDoubt(id, getRequiredUser(res))))
})

doubtsRouter.patch('/doubts/:id', requireUser, async (req, res) => {
  const { id } = parse(idParams, req.params)
  const body = parse(moderateDoubtBody, req.body)
  res.json(ok(await moderateDoubt(id, getRequiredUser(res), body)))
})