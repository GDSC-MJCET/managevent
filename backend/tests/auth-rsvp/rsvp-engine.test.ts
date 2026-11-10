import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { harness } from '../helpers/prismaHarness.js'
import { createTestJwt } from '../helpers/auth.js'

vi.mock('../../src/db/index.js', () => ({
  prisma: harness.mock,
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

const { app } = await import('../../src/app.js')

const OWNER_ID = 'aaaa1111-0000-0000-0000-000000000001'
const SCREENSHOT = { screenshotUrl: 'https://cloud.example.com/pay.png' }

function auth(userId: string, role: 'student' | 'club_admin' | 'super_admin' = 'student') {
  return { Authorization: `Bearer ${createTestJwt(userId, role)}` }
}

interface Seeded {
  eventId: string
  students: string[]
}

function seedAutoEvent(capacity: number, studentCount: number): Seeded {
  const owner = harness.seedUser({ id: OWNER_ID, role: 'club_admin', email: 'owner@test.edu' })
  const event = harness.seedEvent({
    club: { ownerId: owner.id },
    settings: { capacity, approvalMode: 'auto_until_full', isPaid: false },
  })
  const students: string[] = []
  for (let i = 0; i < studentCount; i += 1) {
    const s = harness.seedUser({ email: `s${i}@test.edu` })
    students.push(s.id)
  }
  return { eventId: event.id, students }
}

function seedPaidEvent(capacity: number, studentCount: number): Seeded {
  const owner = harness.seedUser({ id: OWNER_ID, role: 'club_admin', email: 'owner@test.edu' })
  const event = harness.seedEvent({
    club: { ownerId: owner.id },
    settings: { capacity, approvalMode: 'auto_until_full', isPaid: true, price: 100, qrUrl: 'https://cloud.example.com/qr.png' },
  })
  const students: string[] = []
  for (let i = 0; i < studentCount; i += 1) {
    const s = harness.seedUser({ email: `s${i}@test.edu` })
    students.push(s.id)
  }
  return { eventId: event.id, students }
}

async function rsvp(eventId: string, userId: string, extra: Record<string, unknown> = {}) {
  return request(app).post(`/api/events/${eventId}/rsvp`).set(auth(userId)).send(extra)
}

describe('AL-07: POST /api/events/:id/rsvp', () => {
  beforeEach(() => harness.reset())

  it('answers with VALIDATION for a malformed event id', async () => {
    const uid = harness.seedUser({}).id
    const res = await request(app).post('/api/events/not-a-uuid/rsvp').set(auth(uid)).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  it('404 for an unknown event', async () => {
    const uid = harness.seedUser({}).id
    const res = await rsvp('9a2b3c4d-0000-0000-0000-000000000009', uid)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('401 without a token', async () => {
    const { eventId } = seedAutoEvent(5, 1)
    const res = await request(app).post(`/api/events/${eventId}/rsvp`).send({})
    expect(res.status).toBe(401)
  })

  it('EVENT_NOT_OPEN when the event is not open (BR-R1)', async () => {
    const owner = harness.seedUser({ id: OWNER_ID, role: 'club_admin' })
    const event = harness.seedEvent({ status: 'live', club: { ownerId: owner.id } })
    const uid = harness.seedUser({}).id

    const res = await rsvp(event.id, uid)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EVENT_NOT_OPEN')
  })

  it('auto-approves under capacity and waitlists past it (BR-R3)', async () => {
    const { eventId, students } = seedAutoEvent(1, 2)
    const [u1, u2] = students as [string, string]

    const first = await rsvp(eventId, u1)
    expect(first.status).toBe(201)
    expect(first.body.data.status).toBe('approved')

    const second = await rsvp(eventId, u2)
    expect(second.status).toBe(201)
    expect(second.body.data.status).toBe('waitlist')
  })

  it('blocks double RSVP with ALREADY_RSVPED (BR-R1)', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    await rsvp(eventId, students[0]!)

    const dupe = await rsvp(eventId, students[0]!)
    expect(dupe.status).toBe(409)
    expect(dupe.body.error.code).toBe('ALREADY_RSVPED')
  })

  it('re-RSVP after cancel reuses the row and re-approves (BR-R1)', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    const uid = students[0]!

    const first = await rsvp(eventId, uid)
    expect(first.body.data.status).toBe('approved')
    const rsvpId = first.body.data.id

    const cancel = await request(app).delete(`/api/rsvps/${rsvpId}`).set(auth(uid))
    expect(cancel.status).toBe(200)
    expect(cancel.body.data.status).toBe('cancelled')

    const again = await rsvp(eventId, uid)
    expect(again.status).toBe(201)
    expect(again.body.data.id).toBe(rsvpId)
    expect(again.body.data.status).toBe('approved')
  })

  it('manual mode leaves the decision to the club (BR-R4)', async () => {
    const owner = harness.seedUser({ id: OWNER_ID, role: 'club_admin' })
    const event = harness.seedEvent({
      club: { ownerId: owner.id },
      settings: { capacity: 5, approvalMode: 'manual', isPaid: false },
    })
    const uid = harness.seedUser({}).id

    const res = await rsvp(event.id, uid)
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('pending')
  })

  it('paid events require a screenshot (BR-R5) and stay pending', async () => {
    const { eventId, students } = seedPaidEvent(5, 1)
    const uid = students[0]!

    const noShot = await rsvp(eventId, uid)
    expect(noShot.status).toBe(400)
    expect(noShot.body.error.code).toBe('VALIDATION')

    const ok = await rsvp(eventId, uid, SCREENSHOT)
    expect(ok.status).toBe(201)
    expect(ok.body.data.status).toBe('pending')

    // A payment row tracks the screenshot for Anas's AN-03 queue.
    expect(harness.db.payments.some((p) => p.rsvpId === ok.body.data.id)).toBe(true)
  })

  it('QR_REQUIRED when a paid event has no QR configured', async () => {
    const owner = harness.seedUser({ id: OWNER_ID, role: 'club_admin' })
    const event = harness.seedEvent({
      club: { ownerId: owner.id },
      settings: { capacity: 5, approvalMode: 'auto_until_full', isPaid: true, price: 100 },
    })
    const uid = harness.seedUser({}).id

    const res = await rsvp(event.id, uid, SCREENSHOT)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('QR_REQUIRED')
  })

  it('enforces required custom questions from the RSVP form (AN-01 + AL-07)', async () => {
    const owner = harness.seedUser({ id: OWNER_ID, role: 'club_admin' })
    const event = harness.seedEvent({ club: { ownerId: owner.id } })
    harness.seedField({
      eventId: event.id,
      label: 'Which track?',
      type: 'select',
      required: true,
      options: ['Web', 'AI'],
    })
    const uid = harness.seedUser({}).id

    const missing = await rsvp(event.id, uid)
    expect(missing.status).toBe(400)
    expect(missing.body.error.message).toContain('Which track?')

    const wrongChoice = await rsvp(event.id, uid, { answers: { 'Which track?': 'Quantum' } })
    expect(wrongChoice.status).toBe(400)

    const good = await rsvp(event.id, uid, { answers: { 'Which track?': 'Web' } })
    expect(good.status).toBe(201)
    expect(good.body.data.status).toBe('approved')
  })

  it('BR-R5: owner verifying payment approves while seats remain, waitlists when full', async () => {
    const { eventId, students } = seedPaidEvent(1, 2)
    const [u1, u2] = students as [string, string]

    const r1 = await rsvp(eventId, u1, SCREENSHOT)
    expect(r1.body.data.status).toBe('pending')

    // BR-R5 auto mode: verification approves while a seat remains.
    const verify1 = await request(app)
      .patch(`/api/payments/${r1.body.data.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'verified' })
    expect(verify1.status).toBe(200)
    expect(verify1.body.data.rsvpStatus).toBe('approved')

    const r2 = await rsvp(eventId, u2, SCREENSHOT)
    expect(r2.body.data.status).toBe('pending')

    // Capacity is now full: verification waitlists instead (BR-R5).
    const verify2 = await request(app)
      .patch(`/api/payments/${r2.body.data.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'verified' })
    expect(verify2.status).toBe(200)
    expect(verify2.body.data.rsvpStatus).toBe('waitlist')
  })
})

describe('BR-R2 acceptance: 20 parallel RSVPs on capacity 5 -> exactly 5 approved', () => {
  beforeEach(() => harness.reset())

  it('never oversells under parallel load', async () => {
    const { eventId, students } = seedAutoEvent(5, 20)

    const responses = await Promise.all(students.map((uid) => rsvp(eventId, uid)))

    const statuses = responses.map((r) => r.body.data.status as string)
    expect(responses.every((r) => r.status === 201)).toBe(true)
    expect(statuses.filter((s) => s === 'approved')).toHaveLength(5)
    expect(statuses.filter((s) => s === 'waitlist')).toHaveLength(15)
  })
})

describe('AL-08: cancel / my rsvps / my rsvp-for-event', () => {
  beforeEach(() => harness.reset())

  it('rejects cancelling someone elseâ€™s RSVP', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    const rsvpId = harness.seedRsvp({ eventId, userId: students[0]!, status: 'approved' }).id
    const stranger = harness.seedUser({ email: 'stranger@test.edu' }).id

    const res = await request(app).delete(`/api/rsvps/${rsvpId}`).set(auth(stranger))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('BR-R7: cancelling promotes the oldest waitlisted RSVP (FIFO) in one transaction', async () => {
    const { eventId, students } = seedAutoEvent(2, 3)
    const [u1, u2, u3] = students as [string, string, string]

    await rsvp(eventId, u1)
    await rsvp(eventId, u2)
    await rsvp(eventId, u3)

    const u1Rsvp = harness.db.rsvps.find((r) => r.userId === u1)!
    const u2Rsvp = harness.db.rsvps.find((r) => r.userId === u2)!
    const u3Rsvp = harness.db.rsvps.find((r) => r.userId === u3)!
    expect(u1Rsvp.status).toBe('approved')
  
    expect(u2Rsvp.status).toBe('approved')
    expect(u3Rsvp.status).toBe('waitlist')

    const cancel = await request(app).delete(`/api/rsvps/${u1Rsvp.id}`).set(auth(u1))
    expect(cancel.status).toBe(200)
    expect(cancel.body.data.status).toBe('cancelled')
    expect(cancel.body.data.promotedRsvpIds).toEqual([u3Rsvp.id])

    expect(harness.db.rsvps.find((r) => r.id === u2Rsvp.id)!.status).toBe('approved')
    expect(harness.db.rsvps.find((r) => r.id === u3Rsvp.id)!.status).toBe('approved')
  })

  it('BR-R7: paid waitlisted users do NOT promote while payment is unverified', async () => {
    const { eventId, students } = seedPaidEvent(1, 2)
    const [u1, u2] = students as [string, string]

    await rsvp(eventId, u1, SCREENSHOT)
    const r2 = await rsvp(eventId, u2, SCREENSHOT)

    // u1 pays and gets auto-approved on verification (BR-R5); the club
    // explicitly waitlists u2 through attendee ops (BR-R4).
    await request(app)
      .patch(`/api/payments/${harness.db.rsvps.find((r) => r.userId === u1)!.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'verified' })

    await request(app)
      .patch(`/api/rsvps/${r2.body.data.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'waitlist' })

    const u1RsvpId = harness.db.rsvps.find((r) => r.userId === u1)!.id

    // u2's payment is still pending -> no promotion.
    const cancel = await request(app).delete(`/api/rsvps/${u1RsvpId}`).set(auth(u1))
    expect(cancel.status).toBe(200)
    expect(cancel.body.data.promotedRsvpIds).toEqual([])
    expect(harness.db.rsvps.find((r) => r.id === r2.body.data.id)!.status).toBe('waitlist')
  })

  it('BR-R7: a paid waitlisted user with verified payment promotes on cancel', async () => {
    const { eventId, students } = seedPaidEvent(1, 2)
    const [u1, u2] = students as [string, string]

    await rsvp(eventId, u1, SCREENSHOT)
    const r2 = await rsvp(eventId, u2, SCREENSHOT)

    await request(app)
      .patch(`/api/payments/${harness.db.rsvps.find((r) => r.userId === u1)!.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'verified' })

    await request(app)
      .patch(`/api/rsvps/${r2.body.data.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'waitlist' })

    // The club verified u2's payment while u1 still holds the seat.
    const u2Payment = harness.db.payments.find((p) => p.rsvpId === r2.body.data.id)!
    u2Payment.status = 'verified'

    const u1RsvpId = harness.db.rsvps.find((r) => r.userId === u1)!.id
    const cancel = await request(app).delete(`/api/rsvps/${u1RsvpId}`).set(auth(u1))
    expect(cancel.body.data.promotedRsvpIds).toEqual([r2.body.data.id])
    expect(harness.db.rsvps.find((r) => r.id === r2.body.data.id)!.status).toBe('approved')
  })

  it('GET /api/me/rsvps lists own RSVPs with event + payment summaries', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    await rsvp(eventId, students[0]!)

    const res = await request(app).get('/api/me/rsvps').set(auth(students[0]!))
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.items[0]?.event.id).toBe(eventId)
    expect(res.body.data.items[0]?.payment).toBeNull()
  })

  it('GET /api/me/rsvps never returns other usersâ€™ tickets', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    await rsvp(eventId, students[0]!)

    const other = harness.seedUser({ email: 'other@test.edu' }).id
    const res = await request(app).get('/api/me/rsvps').set(auth(other))
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(0)
  })

  it('GET /api/events/:id/rsvp/me returns the callerâ€™s RSVP or null', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    const created = await rsvp(eventId, students[0]!)

    const mine = await request(app).get(`/api/events/${eventId}/rsvp/me`).set(auth(students[0]!))
    expect(mine.status).toBe(200)
    expect(mine.body.data?.id).toBe(created.body.data.id)

    const freshUser = harness.seedUser({ email: 'fresh@test.edu' }).id
    const none = await request(app).get(`/api/events/${eventId}/rsvp/me`).set(auth(freshUser))
    expect(none.status).toBe(200)
    expect(none.body.data).toBeNull()
  })
})

describe('BR-R4/R10: attendee-ops transitions run through Aliâ€™s engine', () => {
  beforeEach(() => harness.reset())

  it('the club cannot approve past capacity (EVENT_FULL)', async () => {
    const { eventId, students } = seedAutoEvent(1, 2)
    const [u1, u2] = students as [string, string]

    await rsvp(eventId, u1)
    await rsvp(eventId, u2)

    const u2Rsvp = harness.db.rsvps.find((r) => r.userId === u2)!
    expect(u2Rsvp.status).toBe('waitlist')

    const res = await request(app)
      .patch(`/api/rsvps/${u2Rsvp.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'approved' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EVENT_FULL')
  })

  it('rejection and waitlisting stay available for the club (BR-R10)', async () => {
    const { eventId, students } = seedAutoEvent(5, 1)
    const created = await rsvp(eventId, students[0]!)

    const reject = await request(app)
      .patch(`/api/rsvps/${created.body.data.id}`)
      .set(auth(OWNER_ID, 'club_admin'))
      .send({ status: 'rejected' })
    expect(reject.status).toBe(200)
    expect(harness.db.rsvps.find((r) => r.id === created.body.data.id)!.status).toBe('rejected')
  })
})
