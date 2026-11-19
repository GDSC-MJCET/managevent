import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

// Setup mocked prisma
const mockPrisma = {
  event: {
    findUnique: vi.fn(),
  },
  certificate: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  rsvp: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('../../src/db/index.js', () => ({
  prisma: mockPrisma,
}))

// Import Express app after mocking prisma
const { app } = await import('../../src/app.js')

describe('AD-02: Certificate API Endpoints', () => {
  const OWNER_ID = '11111111-1111-4111-8111-111111111111'
  const NON_OWNER_ID = '22222222-2222-4222-8222-222222222222'
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333'
  const STUDENT_ID_2 = '44444444-4444-4444-8444-444444444444'
  const EVENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const CERT_ID_1 = '77777777-7777-4777-8777-777777777771'
  const CERT_ID_2 = '77777777-7777-4777-8777-777777777772'

  const demoEvent = {
    id: EVENT_ID,
    title: 'MJCET Hackathon 2026',
    bannerUrl: 'https://example.com/banner.jpg',
    venue: 'Auditorium',
    startsAt: new Date('2026-11-15T09:00:00Z'),
    endsAt: new Date('2026-11-16T18:00:00Z'),
    club: {
      id: 'club-uuid-1',
      ownerId: OWNER_ID,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation((calls: any) =>
      Array.isArray(calls) ? Promise.all(calls) : calls(mockPrisma),
    )
  })

  // ── 1. Successful certificate assignment (Single) ─────────────────────────
  it('1. POST /api/events/:id/certificates - successfully assigns a certificate to an approved attendee', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    // Attendee is approved
    mockPrisma.rsvp.findUnique.mockResolvedValue({
      id: 'rsvp-1',
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      status: 'approved',
      checkin: null,
    })
    // No existing certificate
    mockPrisma.certificate.findUnique.mockResolvedValue(null)
    mockPrisma.certificate.create.mockResolvedValue({
      id: CERT_ID_1,
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      fileUrl: 'https://res.cloudinary.com/demo/cert.pdf',
      issuedAt: new Date('2026-11-19T17:00:00Z'),
    })

    const payload = {
      user_id: STUDENT_ID,
      file_url: 'https://res.cloudinary.com/demo/cert.pdf',
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.certificate).toEqual({
      id: CERT_ID_1,
      event_id: EVENT_ID,
      user_id: STUDENT_ID,
      file_url: 'https://res.cloudinary.com/demo/cert.pdf',
      issued_at: '2026-11-19T17:00:00.000Z',
    })
  })

  // ── 2. Successful batch certificate assignment ────────────────────────────
  it('2. POST /api/events/:id/certificates - successfully assigns batch certificates', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    // Both attendees are eligible
    mockPrisma.rsvp.findUnique
      .mockResolvedValueOnce({
        id: 'rsvp-1',
        eventId: EVENT_ID,
        userId: STUDENT_ID,
        status: 'approved',
        checkin: null,
      })
      .mockResolvedValueOnce({
        id: 'rsvp-2',
        eventId: EVENT_ID,
        userId: STUDENT_ID_2,
        status: 'pending',
        checkin: { id: 'checkin-1', checkedInAt: new Date() }, // checked-in attendee
      })
    mockPrisma.certificate.findUnique.mockResolvedValue(null)
    mockPrisma.certificate.create
      .mockResolvedValueOnce({
        id: CERT_ID_1,
        eventId: EVENT_ID,
        userId: STUDENT_ID,
        fileUrl: 'https://res.cloudinary.com/demo/cert1.pdf',
        issuedAt: new Date('2026-11-19T17:00:00Z'),
      })
      .mockResolvedValueOnce({
        id: CERT_ID_2,
        eventId: EVENT_ID,
        userId: STUDENT_ID_2,
        fileUrl: 'https://res.cloudinary.com/demo/cert2.pdf',
        issuedAt: new Date('2026-11-19T17:00:00Z'),
      })

    const payload = {
      assignments: [
        { user_id: STUDENT_ID, file_url: 'https://res.cloudinary.com/demo/cert1.pdf' },
        { user_id: STUDENT_ID_2, file_url: 'https://res.cloudinary.com/demo/cert2.pdf' },
      ],
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.certificates).toHaveLength(2)
  })

  // ── 3. Rejection of unapproved attendees ──────────────────────────────────
  it('3. POST /api/events/:id/certificates - rejects unapproved attendees with NOT_APPROVED', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    // Attendee is pending with no checkin
    mockPrisma.rsvp.findUnique.mockResolvedValue({
      id: 'rsvp-1',
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      status: 'pending',
      checkin: null,
    })

    const payload = {
      user_id: STUDENT_ID,
      file_url: 'https://res.cloudinary.com/demo/cert.pdf',
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('NOT_APPROVED')
    expect(mockPrisma.certificate.create).not.toHaveBeenCalled()
  })

  // ── 4. Rejection of duplicate assignment (Unique constraint) ──────────────
  it('4. POST /api/events/:id/certificates - rejects duplicate certificate with CONFLICT', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    mockPrisma.rsvp.findUnique.mockResolvedValue({
      id: 'rsvp-1',
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      status: 'approved',
      checkin: null,
    })
    // Existing certificate found
    mockPrisma.certificate.findUnique.mockResolvedValue({
      id: CERT_ID_1,
      eventId: EVENT_ID,
      userId: STUDENT_ID,
    })

    const payload = {
      user_id: STUDENT_ID,
      file_url: 'https://res.cloudinary.com/demo/cert.pdf',
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(409)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  // ── 5. Rejection of unauthorized club administrator ───────────────────────
  it('5. POST /api/events/:id/certificates - rejects non-owner club admin with FORBIDDEN', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)

    const payload = {
      user_id: STUDENT_ID,
      file_url: 'https://res.cloudinary.com/demo/cert.pdf',
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', NON_OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  // ── 6. Student retrieves only their own certificates (BR-P4) ─────────────
  it('6. GET /api/me/certificates - returns certificates for the authenticated user only', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue([
      {
        id: CERT_ID_1,
        eventId: EVENT_ID,
        userId: STUDENT_ID,
        fileUrl: 'https://res.cloudinary.com/demo/cert.pdf',
        issuedAt: new Date('2026-11-19T17:00:00Z'),
        event: demoEvent,
      },
    ])

    const res = await request(app)
      .get('/api/me/certificates')
      .set('x-user-id', STUDENT_ID)
      .set('x-user-role', 'student')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.certificates).toHaveLength(1)
    expect(res.body.data.certificates[0].id).toBe(CERT_ID_1)
    expect(res.body.data.certificates[0].event.title).toBe(demoEvent.title)
    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith({
      where: { userId: STUDENT_ID },
      include: expect.any(Object),
      orderBy: { issuedAt: 'desc' },
    })
  })

  // ── 7. Club owner views all event certificates ───────────────────────────
  it('7. GET /api/events/:id/certificates - club owner views all certificates for event', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    mockPrisma.certificate.findMany.mockResolvedValue([
      {
        id: CERT_ID_1,
        eventId: EVENT_ID,
        userId: STUDENT_ID,
        fileUrl: 'https://res.cloudinary.com/demo/cert.pdf',
        issuedAt: new Date('2026-11-19T17:00:00Z'),
        user: {
          id: STUDENT_ID,
          name: 'Adnan Hyder',
          email: 'adnan@mjcet.ac.in',
          rollNumber: '1604-22-733-001',
        },
      },
    ])

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.count).toBe(1)
    expect(res.body.data.certificates[0].user.name).toBe('Adnan Hyder')
  })

  // ── 8. Rejection of non-owner attempting to view event certificates ──────
  it('8. GET /api/events/:id/certificates - rejects non-owner with FORBIDDEN', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)

    const res = await request(app)
      .get(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', NON_OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  // ── 9. Event not found handling ──────────────────────────────────────────
  it('9. POST /api/events/:id/certificates - returns NOT_FOUND if event does not exist', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({
        user_id: STUDENT_ID,
        file_url: 'https://res.cloudinary.com/demo/cert.pdf',
      })

    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  // ── 10. Unauthenticated request rejection ────────────────────────────────
  it('10. GET /api/me/certificates - rejects unauthenticated request with UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/me/certificates')

    expect(res.status).toBe(401)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  // ── 11. Invalid UUID route params rejection ──────────────────────────────
  it('11. Rejects invalid event UUID with VALIDATION', async () => {
    const res = await request(app)
      .get('/api/events/invalid-uuid-format/certificates')
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  // ── 12. Invalid body validation ──────────────────────────────────────────
  it('12. POST /api/events/:id/certificates - rejects invalid body with VALIDATION', async () => {
    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({ user_id: 'bad-uuid', file_url: 'not-a-url' })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION')
  })

  // ── 13. Student role cannot access club endpoints ────────────────────────
  it('13. POST /api/events/:id/certificates - student role is rejected with FORBIDDEN', async () => {
    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', STUDENT_ID)
      .set('x-user-role', 'student')
      .send({
        user_id: STUDENT_ID,
        file_url: 'https://res.cloudinary.com/demo/cert.pdf',
      })

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  // ── 14. Transactional failure handling ───────────────────────────────────
  it('14. POST /api/events/:id/certificates - handles transactional errors gracefully', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    mockPrisma.rsvp.findUnique.mockResolvedValue({
      id: 'rsvp-1',
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      status: 'approved',
      checkin: null,
    })
    mockPrisma.certificate.findUnique.mockResolvedValue(null)
    mockPrisma.$transaction.mockRejectedValueOnce(
      new Error('Database write failure'),
    )

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({
        user_id: STUDENT_ID,
        file_url: 'https://res.cloudinary.com/demo/cert.pdf',
      })

    expect(res.status).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('INTERNAL')
  })

  // ── 15. Verified checkin attendee without approved status ───────────────
  it('15. POST /api/events/:id/certificates - issues certificate to checked-in attendee even if RSVP status is waitlist', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    mockPrisma.rsvp.findUnique.mockResolvedValue({
      id: 'rsvp-waitlist',
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      status: 'waitlist',
      checkin: { id: 'checkin-1', checkedInAt: new Date() },
    })
    mockPrisma.certificate.findUnique.mockResolvedValue(null)
    mockPrisma.certificate.create.mockResolvedValue({
      id: CERT_ID_1,
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      fileUrl: 'https://res.cloudinary.com/demo/cert.pdf',
      issuedAt: new Date('2026-11-19T17:00:00Z'),
    })

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({
        user_id: STUDENT_ID,
        file_url: 'https://res.cloudinary.com/demo/cert.pdf',
      })

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.certificate.id).toBe(CERT_ID_1)
  })

  // ── 16. Batch assignment rejects duplicate user_ids in payload ──────────
  it('16. POST /api/events/:id/certificates - rejects duplicate user_id in assignments payload with VALIDATION', async () => {
    const payload = {
      assignments: [
        { user_id: STUDENT_ID, file_url: 'https://res.cloudinary.com/demo/cert1.pdf' },
        { user_id: STUDENT_ID, file_url: 'https://res.cloudinary.com/demo/cert2.pdf' },
      ],
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION')
    expect(res.body.error.message).toContain('Duplicate user_id')
  })

  // ── 17. Concurrent issuance handling via P2002 ──────────────────────────
  it('17. POST /api/events/:id/certificates - converts Prisma P2002 unique violation to CONFLICT', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(demoEvent)
    mockPrisma.rsvp.findUnique.mockResolvedValue({
      id: 'rsvp-1',
      eventId: EVENT_ID,
      userId: STUDENT_ID,
      status: 'approved',
      checkin: null,
    })
    mockPrisma.certificate.findUnique.mockResolvedValue(null)
    // Simulate concurrent insert race condition causing P2002
    const p2002Error: any = new Error('Unique constraint failed')
    p2002Error.code = 'P2002'
    mockPrisma.$transaction.mockRejectedValueOnce(p2002Error)

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/certificates`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({
        user_id: STUDENT_ID,
        file_url: 'https://res.cloudinary.com/demo/cert.pdf',
      })

    expect(res.status).toBe(409)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  // ── 18. GET /api/me/certificates ignores client-supplied query/body ──────
  it('18. GET /api/me/certificates - strictly queries authenticated user and ignores spoofed query params', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue([])

    await request(app)
      .get(`/api/me/certificates?user_id=${NON_OWNER_ID}`)
      .set('x-user-id', STUDENT_ID)
      .set('x-user-role', 'student')

    // Must be queried with STUDENT_ID from req.user, not the spoofed query param
    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith({
      where: { userId: STUDENT_ID },
      include: expect.any(Object),
      orderBy: { issuedAt: 'desc' },
    })
  })

  // ── 19. Headers ignored when NODE_ENV !== 'test' ────────────────────────
  it('19. Header-based auth simulation is ignored outside test mode', async () => {
    const originalEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'

      const res = await request(app)
        .get('/api/me/certificates')
        .set('x-user-id', STUDENT_ID)
        .set('x-user-role', 'student')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})
