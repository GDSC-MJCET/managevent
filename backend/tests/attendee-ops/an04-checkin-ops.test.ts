import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db/index.js'
import { createTestJwt } from '../helpers/auth.js'
import { CheckinResultSchema, EventOpsMetricsSchema } from '../../src/modules/attendee-ops/schema.js'

vi.mock('../../src/db/index.js', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    event: {
      findUnique: vi.fn(),
    },
    rsvp: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    checkin: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  }
  return {
    prisma: mockPrisma,
    connectDatabase: vi.fn(),
    disconnectDatabase: vi.fn(),
  }
})

describe('AN-04: Event-Day Check-in & Operations API', () => {
  const eventId = 'e1a2b3c4-0000-4000-8000-000000000001'
  const otherEventId = 'e2a2b3c4-0000-4000-8000-000000000002'
  const ownerId = 'b1a2b3c4-0000-4000-8000-000000000001'
  const nonOwnerId = 'b2b3c4d5-0000-4000-8000-000000000002'
  const rsvpId = 'c1a2b3c4-0000-4000-8000-000000000001'
  const checkinId = 'd1a2b3c4-0000-4000-8000-000000000001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. POST /api/events/:id/checkin/:rsvpId ───────────────────────────────

  describe('POST /api/events/:id/checkin/:rsvpId', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).post(`/api/events/${eventId}/checkin/${rsvpId}`)

      expect(res.status).toBe(401)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 400 when event ID is not a valid UUID', async () => {
      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/invalid-uuid/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('VALIDATION')
      expect(prisma.event.findUnique).not.toHaveBeenCalled()
    })

    it('returns 400 when RSVP ID is not a valid UUID', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/not-a-valid-uuid`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('VALIDATION')
      expect(prisma.checkin.upsert).not.toHaveBeenCalled()
    })

    it('returns 403 when caller is not the club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(prisma.checkin.upsert).not.toHaveBeenCalled()
    })

    it('returns 404 when event is not found', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 409 CONFLICT when event is not live (BR-R8)', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValueOnce({
          id: eventId,
          club: { ownerId },
        } as any)
        .mockResolvedValueOnce({
          id: eventId,
          status: 'open', // not live
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId,
        status: 'approved',
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(409)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('CONFLICT')
      expect(res.body.error.message).toContain('live')
      expect(prisma.checkin.upsert).not.toHaveBeenCalled()
    })

    it('returns 404 when RSVP is not found for this event', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValueOnce({
          id: eventId,
          club: { ownerId },
        } as any)
        .mockResolvedValueOnce({
          id: eventId,
          status: 'live',
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue(null)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 when RSVP belongs to a different event', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValueOnce({
          id: eventId,
          club: { ownerId },
        } as any)
        .mockResolvedValueOnce({
          id: eventId,
          status: 'live',
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId: otherEventId, // different event
        status: 'approved',
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 403 NOT_APPROVED when RSVP is not in approved status (BR-R8)', async () => {
      const nonApprovedStatuses = ['pending', 'rejected', 'waitlist', 'cancelled'] as const

      for (const status of nonApprovedStatuses) {
        vi.mocked(prisma.event.findUnique)
          .mockResolvedValueOnce({
            id: eventId,
            club: { ownerId },
          } as any)
          .mockResolvedValueOnce({
            id: eventId,
            status: 'live',
          } as any)

        vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
          id: rsvpId,
          eventId,
          status,
        } as any)

        const token = createTestJwt(ownerId, 'club_admin')
        const res = await request(app)
          .post(`/api/events/${eventId}/checkin/${rsvpId}`)
          .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(403)
        expect(res.body.ok).toBe(false)
        expect(res.body.error.code).toBe('NOT_APPROVED')
        expect(prisma.checkin.upsert).not.toHaveBeenCalled()
      }
    })

    it('successfully checks in an approved attendee when event is live (BR-R8)', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValueOnce({
          id: eventId,
          club: { ownerId },
        } as any)
        .mockResolvedValueOnce({
          id: eventId,
          status: 'live',
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId,
        status: 'approved',
      } as any)

      const checkedInAt = new Date('2026-10-22T00:10:00.000Z')
      vi.mocked(prisma.checkin.create).mockResolvedValue({
        id: checkinId,
        rsvpId,
        checkedInAt,
        checkedInBy: ownerId,
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.id).toBe(checkinId)
      expect(res.body.data.rsvpId).toBe(rsvpId)
      expect(res.body.data.checkedInAt).toBe(checkedInAt.toISOString())
      expect(res.body.data.checkedInBy).toBe(ownerId)
      expect(res.body.error).toBeNull()

      // Validate response against contract
      const contractValidation = CheckinResultSchema.safeParse(res.body.data)
      expect(contractValidation.success).toBe(true)

      // Verified atomic create called with correct attributes
      expect(prisma.checkin.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          rsvpId,
          checkedInBy: ownerId,
        },
      })
    })

    it('is idempotent on repeat/concurrent check-in via P2002 unique conflict recovery (BR-R8)', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValue({
          id: eventId,
          status: 'live',
          club: { ownerId },
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId,
        status: 'approved',
      } as any)

      const originalCheckedInAt = new Date('2026-10-22T00:05:00.000Z')
      const originalOperatorId = 'original-operator-uuid'

      // Simulated unique constraint collision (P2002) on concurrent or repeated check-in
      vi.mocked(prisma.checkin.create).mockRejectedValueOnce({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`rsvp_id`)',
      })
      // Recovery retrieves the existing record without overwriting
      vi.mocked(prisma.checkin.findUnique).mockResolvedValueOnce({
        id: checkinId,
        rsvpId,
        checkedInAt: originalCheckedInAt,
        checkedInBy: originalOperatorId,
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.id).toBe(checkinId)
      expect(res.body.data.checkedInAt).toBe(originalCheckedInAt.toISOString())
      expect(res.body.data.checkedInBy).toBe(originalOperatorId)

      expect(prisma.checkin.create).toHaveBeenCalled()
      expect(prisma.checkin.findUnique).toHaveBeenCalledWith({
        where: { rsvpId },
      })
    })

    it('rethrows original error when P2002 conflict occurs but existing record cannot be found', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValue({
          id: eventId,
          status: 'live',
          club: { ownerId },
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId,
        status: 'approved',
      } as any)

      vi.mocked(prisma.checkin.create).mockRejectedValueOnce({
        code: 'P2002',
        message: 'Spurious unique constraint error',
      })
      vi.mocked(prisma.checkin.findUnique).mockResolvedValueOnce(null)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(500)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('INTERNAL')
    })

    it('does not swallow unrelated database errors during check-in creation', async () => {
      vi.mocked(prisma.event.findUnique)
        .mockResolvedValue({
          id: eventId,
          status: 'live',
          club: { ownerId },
        } as any)

      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId,
        status: 'approved',
      } as any)

      vi.mocked(prisma.checkin.create).mockRejectedValueOnce(
        new Error('Database connection failure'),
      )

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(500)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('INTERNAL')
      expect(prisma.checkin.findUnique).not.toHaveBeenCalled()
    })
  })

  // ── 2. DELETE /api/events/:id/checkin/:rsvpId ─────────────────────────────

  describe('DELETE /api/events/:id/checkin/:rsvpId', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).delete(`/api/events/${eventId}/checkin/${rsvpId}`)

      expect(res.status).toBe(401)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 400 when event ID or RSVP ID is malformed', async () => {
      const token = createTestJwt(ownerId, 'club_admin')

      const resBadEvent = await request(app)
        .delete(`/api/events/bad-id/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(resBadEvent.status).toBe(400)
      expect(resBadEvent.body.error.code).toBe('VALIDATION')

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const resBadRsvp = await request(app)
        .delete(`/api/events/${eventId}/checkin/bad-rsvp-id`)
        .set('Authorization', `Bearer ${token}`)
      expect(resBadRsvp.status).toBe(400)
      expect(resBadRsvp.body.error.code).toBe('VALIDATION')
    })

    it('returns 403 when caller is not the club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .delete(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 404 when RSVP does not exist or belongs to another event', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId: otherEventId, // foreign event
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .delete(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(prisma.checkin.deleteMany).not.toHaveBeenCalled()
    })

    it('successfully undoes a check-in and is idempotent on repeat (BR-R8)', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId,
        eventId,
      } as any)
      vi.mocked(prisma.checkin.deleteMany).mockResolvedValue({ count: 1 })

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .delete(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data).toEqual({
        rsvpId,
        checkedIn: false,
      })
      expect(res.body.error).toBeNull()

      expect(prisma.checkin.deleteMany).toHaveBeenCalledWith({
        where: { rsvpId },
      })

      // Second call (already absent) still succeeds cleanly
      vi.mocked(prisma.checkin.deleteMany).mockResolvedValue({ count: 0 })
      const resRepeat = await request(app)
        .delete(`/api/events/${eventId}/checkin/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(resRepeat.status).toBe(200)
      expect(resRepeat.body.data.checkedIn).toBe(false)
    })
  })

  // ── 3. GET /api/events/:id/ops ────────────────────────────────────────────

  describe('GET /api/events/:id/ops', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/events/${eventId}/ops`)

      expect(res.status).toBe(401)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 400 when event ID is not a valid UUID', async () => {
      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get('/api/events/not-a-valid-uuid/ops')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('VALIDATION')
    })

    it('returns 403 when caller is not the club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/ops`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns operations metrics with accurate count semantics', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      // registeredCount (all non-cancelled), approvedCount, checkedInCount
      vi.mocked(prisma.rsvp.count)
        .mockResolvedValueOnce(50) // registeredCount (status: { not: 'cancelled' })
        .mockResolvedValueOnce(35) // approvedCount (status: 'approved')
      vi.mocked(prisma.checkin.count).mockResolvedValueOnce(28) // checkedInCount (rsvp: { eventId })

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/ops`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data).toEqual({
        eventId,
        registeredCount: 50,
        approvedCount: 35,
        checkedInCount: 28,
      })
      expect(res.body.error).toBeNull()

      // Validate against schema
      const contractValidation = EventOpsMetricsSchema.safeParse(res.body.data)
      expect(contractValidation.success).toBe(true)

      // Verify Prisma call arguments
      expect(prisma.rsvp.count).toHaveBeenNthCalledWith(1, {
        where: {
          eventId,
          status: { not: 'cancelled' },
        },
      })
      expect(prisma.rsvp.count).toHaveBeenNthCalledWith(2, {
        where: {
          eventId,
          status: 'approved',
        },
      })
      expect(prisma.checkin.count).toHaveBeenCalledWith({
        where: {
          rsvp: {
            eventId,
          },
        },
      })
    })

    it('returns zero counts for an event with no attendees or check-ins', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.count).mockResolvedValue(0)
      vi.mocked(prisma.checkin.count).mockResolvedValue(0)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/ops`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        eventId,
        registeredCount: 0,
        approvedCount: 0,
        checkedInCount: 0,
      })
    })
  })
})
