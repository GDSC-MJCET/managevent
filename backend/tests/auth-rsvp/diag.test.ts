import request from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { harness } from '../helpers/prismaHarness.js'
import { createTestJwt } from '../helpers/auth.js'
vi.mock('../../src/db/index.js', () => ({
  prisma: harness.mock,
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}))
const { app } = await import('../../src/app.js')

function auth(userId: string) {
  return { Authorization: `Bearer ${createTestJwt(userId, 'student')}` }
}

describe('diag5', () => {
  beforeEach(() => harness.reset())

  it('replica', async () => {
    const owner = harness.seedUser({ role: 'club_admin', email: 'owner@test.edu' })
    const event = harness.seedEvent({ club: { ownerId: owner.id } })
    const uid = harness.seedUser({}).id
    const res = await request(app).post(`/api/events/${event.id}/rsvp`).set('Authorization', auth(uid)).send({})
    console.log('STATUS:', res.status, JSON.stringify(res.body).slice(0, 140))
  })
})
