import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db/index.js'
import { createTestJwt } from '../helpers/auth.js'
import { setRsvpTransitionService } from '../../src/modules/attendee-ops/services/rsvpTransitionProvider.js'
import type { IRsvpTransitionService } from '../../src/modules/attendee-ops/contracts/rsvpTransition.js'
import { sanitizeAndEscapeCsvField } from '../../src/modules/attendee-ops/services/csvExport.js'

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
  }
  return {
    prisma: mockPrisma,
    connectDatabase: vi.fn(),
    disconnectDatabase: vi.fn(),
  }
})

describe('AN-02: Attendee Operations API', () => {
  const eventId = 'e1a2b3c4-0000-4000-8000-000000000001'
  const ownerId = 'b1a2b3c4-0000-4000-8000-000000000001'
  const nonOwnerId = 'b2b3c4d5-0000-4000-8000-000000000002'
  const rsvpId1 = 'c1a2b3c4-0000-4000-8000-000000000001'
  const rsvpId2 = 'c2b3c4d5-0000-4000-8000-000000000002'

  let mockTransitionService: IRsvpTransitionService

  beforeEach(() => {
    vi.clearAllMocks()

    mockTransitionService = {
      transition: vi.fn().mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId1,
          eventId,
          userId: 'u-some-user',
          status: 'approved',
        },
      }),
    }

    setRsvpTransitionService(mockTransitionService)
  })

  describe('CSV Sanitization & RFC 4180 Escaping', () => {
    it('escapes fields with commas, quotes, and line breaks', () => {
      expect(sanitizeAndEscapeCsvField('Hello, World')).toBe('"Hello, World"')
      expect(sanitizeAndEscapeCsvField('He said "Hi"')).toBe('"He said ""Hi"""')
      expect(sanitizeAndEscapeCsvField("Line1\nLine2")).toBe("\"Line1\nLine2\"")
    })

    it('sanitizes spreadsheet formula injection risks', () => {
      expect(sanitizeAndEscapeCsvField('=1+1')).toBe("'=1+1")
      expect(sanitizeAndEscapeCsvField('+CMD()')).toBe("'+CMD()")
      expect(sanitizeAndEscapeCsvField('-2+3')).toBe("'-2+3")
      expect(sanitizeAndEscapeCsvField('@SUM(A1:A5)')).toBe("'@SUM(A1:A5)")
    })

    it('handles null, undefined and objects', () => {
      expect(sanitizeAndEscapeCsvField(null)).toBe('')
      expect(sanitizeAndEscapeCsvField(undefined)).toBe('')
      expect(sanitizeAndEscapeCsvField({ foo: 'bar' })).toBe('"{""foo"":""bar""}"')
    })
  })

  describe('GET /api/events/:id/rsvps', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/events/${eventId}/rsvps`)

      expect(res.status).toBe(401)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 403 when caller is not the club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns paginated attendees with total count for club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.count).mockResolvedValue(1)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        {
          id: rsvpId1,
          eventId,
          userId: 'u100',
          status: 'pending',
          answers: { Branch: 'CSE' },
          createdAt: new Date('2026-10-22T00:00:00.000Z'),
          user: {
            name: 'Ali Student',
            email: 'ali@example.com',
            rollNumber: '1604-22-733-001',
            branch: 'CSE',
            year: 3,
          },
        },
      ] as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps?page=1&limit=10&status=pending`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.total).toBe(1)
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.items[0].id).toBe(rsvpId1)
      expect(res.body.data.items[0].user.name).toBe('Ali Student')
      expect(res.body.data.items[0].checkedIn).toBe(false)
      expect(res.body.data.items[0].checkedInAt).toBeNull()
      expect(res.body.error).toBeNull()
    })

    it('returns checkedIn: true and ISO checkedInAt when a checkin record exists', async () => {
      const checkedInTime = new Date('2026-10-22T10:00:00.000Z')
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.count).mockResolvedValue(1)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        {
          id: rsvpId1,
          eventId,
          userId: 'u1',
          status: 'approved',
          answers: null,
          createdAt: new Date('2026-10-22T00:00:00.000Z'),
          user: {
            name: 'Ali Student',
            email: 'ali@example.com',
            rollNumber: '1604-22-733-001',
            branch: 'CSE',
            year: 3,
          },
          checkin: {
            checkedInAt: checkedInTime,
          },
        },
      ] as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.items[0].checkedIn).toBe(true)
      expect(res.body.data.items[0].checkedInAt).toBe('2026-10-22T10:00:00.000Z')
    })

    it('coerces numeric page and limit query parameters and passes strict numbers to Prisma', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.count).mockResolvedValue(10)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([])

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps?page=2&limit=10&status=pending`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(prisma.rsvp.findMany).toHaveBeenCalledWith({
        where: { eventId, status: 'pending' },
        orderBy: { createdAt: 'asc' },
        skip: 10,
        take: 10,
        include: expect.any(Object),
      })

      const lastCall = vi.mocked(prisma.rsvp.findMany).mock.calls.at(-1)?.[0]
      expect(typeof lastCall?.skip).toBe('number')
      expect(typeof lastCall?.take).toBe('number')
      expect(lastCall?.skip).toBe(10)
      expect(lastCall?.take).toBe(10)
    })

    it('applies schema default values (page 1, limit 20) when pagination parameters are omitted', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.count).mockResolvedValue(0)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([])

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(prisma.rsvp.findMany).toHaveBeenCalledWith({
        where: { eventId },
        orderBy: { createdAt: 'asc' },
        skip: 0,
        take: 20,
        include: expect.any(Object),
      })

      const lastCall = vi.mocked(prisma.rsvp.findMany).mock.calls.at(-1)?.[0]
      expect(typeof lastCall?.skip).toBe('number')
      expect(typeof lastCall?.take).toBe('number')
      expect(lastCall?.skip).toBe(0)
      expect(lastCall?.take).toBe(20)
    })

    it('rejects invalid query parameters and does not invoke Prisma', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const invalidQueries = [
        '?page=0',
        '?page=-1',
        '?page=abc',
        '?limit=0',
        '?limit=101',
        '?status=invalid_status',
      ]

      for (const query of invalidQueries) {
        vi.mocked(prisma.rsvp.findMany).mockClear()
        vi.mocked(prisma.rsvp.count).mockClear()

        const res = await request(app)
          .get(`/api/events/${eventId}/rsvps${query}`)
          .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
        expect(res.body.ok).toBe(false)
        expect(res.body.error.code).toBe('VALIDATION')
        expect(prisma.rsvp.findMany).not.toHaveBeenCalled()
        expect(prisma.rsvp.count).not.toHaveBeenCalled()
      }
    })

    it('ensures validated query state is strictly request-scoped without cross-request leakage', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.count).mockResolvedValue(0)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([])

      const token = createTestJwt(ownerId, 'club_admin')

      // Request 1 with explicit page=3 and limit=15
      const res1 = await request(app)
        .get(`/api/events/${eventId}/rsvps?page=3&limit=15`)
        .set('Authorization', `Bearer ${token}`)
      expect(res1.status).toBe(200)
      const call1 = vi.mocked(prisma.rsvp.findMany).mock.calls.at(-1)?.[0]
      expect(call1?.skip).toBe(30)
      expect(call1?.take).toBe(15)

      // Request 2 without query parameters must use defaults (page 1, limit 20) and not retain request 1 state
      const res2 = await request(app)
        .get(`/api/events/${eventId}/rsvps`)
        .set('Authorization', `Bearer ${token}`)
      expect(res2.status).toBe(200)
      const call2 = vi.mocked(prisma.rsvp.findMany).mock.calls.at(-1)?.[0]
      expect(call2?.skip).toBe(0)
      expect(call2?.take).toBe(20)
    })

    it('handles empty attendee list gracefully', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.count).mockResolvedValue(0)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([])

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
      expect(res.body.data.items).toEqual([])
    })
  })

  describe('PATCH /api/rsvps/:id', () => {
    it('returns 400 VALIDATION for non-UUID RSVP ID', async () => {
      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch('/api/rsvps/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION')
    })

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .patch(`/api/rsvps/${rsvpId1}`)
        .send({ status: 'approved' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 404 when RSVP is not found', async () => {
      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue(null)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/rsvps/${rsvpId1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 403 when caller is not the club owner of the event', async () => {
      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId1,
        event: {
          club: { ownerId },
        },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/rsvps/${rsvpId1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('calls IRsvpTransitionService.transition without updating DB directly', async () => {
      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId1,
        event: {
          club: { ownerId },
        },
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/rsvps/${rsvpId1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data).toEqual({ id: rsvpId1, status: 'approved' })
      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId: rsvpId1,
        toStatus: 'approved',
        actorId: ownerId,
        reason: undefined,
      })
    })

    it('returns 409 when transition fails due to EVENT_FULL', async () => {
      vi.mocked(prisma.rsvp.findUnique).mockResolvedValue({
        id: rsvpId1,
        event: {
          club: { ownerId },
        },
      } as any)

      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: false,
        error: { code: 'EVENT_FULL', message: 'Event capacity reached' },
      })

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/rsvps/${rsvpId1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'approved' })

      expect(res.status).toBe(409)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('EVENT_FULL')
    })
  })

  describe('POST /api/events/:id/rsvps/bulk', () => {
    it('approves RSVPs and reports when capacity is reached', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        { id: rsvpId1, status: 'pending' },
        { id: rsvpId2, status: 'pending' },
      ] as any)

      // First succeeds, second hits capacity
      vi.mocked(mockTransitionService.transition)
        .mockResolvedValueOnce({
          success: true,
          rsvp: { id: rsvpId1, eventId, userId: 'u1', status: 'approved' },
        })
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'EVENT_FULL', message: 'Event capacity reached' },
        })

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/rsvps/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rsvpIds: [rsvpId1, rsvpId2] })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.processed).toEqual([rsvpId1])
      expect(res.body.data.unprocessed).toEqual([
        { rsvpId: rsvpId2, reason: 'Event capacity reached' },
      ])
    })

    it('reports RSVPs that do not belong to the event as unapproved', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      // Only rsvpId1 exists in this event
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        { id: rsvpId1, status: 'pending' },
      ] as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/rsvps/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rsvpIds: [rsvpId1, rsvpId2] })

      expect(res.status).toBe(200)
      expect(res.body.data.processed).toEqual([rsvpId1])
      expect(res.body.data.unprocessed).toEqual([
        { rsvpId: rsvpId2, reason: 'RSVP does not belong to this event' },
      ])
    })

    it('processes bulk waitlist and NEVER calls transition with approved status', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        { id: rsvpId1, status: 'pending' },
      ] as any)

      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: { id: rsvpId1, eventId, userId: 'u1', status: 'waitlist' },
      })

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/rsvps/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'waitlist', rsvpIds: [rsvpId1] })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.status).toBe('waitlist')
      expect(res.body.data.processed).toEqual([rsvpId1])
      expect(res.body.data.unprocessed).toEqual([])
      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId: rsvpId1,
        toStatus: 'waitlist',
        actorId: ownerId,
      })
      expect(mockTransitionService.transition).not.toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'approved' }),
      )
    })

    it('processes bulk reject and NEVER calls transition with approved status', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        { id: rsvpId1, status: 'pending' },
      ] as any)

      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: { id: rsvpId1, eventId, userId: 'u1', status: 'rejected' },
      })

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .post(`/api/events/${eventId}/rsvps/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'rejected', rsvpIds: [rsvpId1] })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.status).toBe('rejected')
      expect(res.body.data.processed).toEqual([rsvpId1])
      expect(res.body.data.unprocessed).toEqual([])
      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId: rsvpId1,
        toStatus: 'rejected',
        actorId: ownerId,
      })
      expect(mockTransitionService.transition).not.toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'approved' }),
      )
    })
  })

  describe('GET /api/events/:id/rsvps/export', () => {
    it('returns RFC 4180 CSV file with proper headers', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([
        {
          id: rsvpId1,
          eventId,
          userId: 'u1',
          status: 'approved',
          answers: { Laptop: true },
          createdAt: new Date('2026-10-22T00:00:00.000Z'),
          user: {
            name: 'John, Doe',
            email: 'john@example.com',
            rollNumber: '1604-22-733-005',
            branch: 'IT',
            year: 4,
          },
        },
      ] as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps/export`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
      expect(res.headers['content-disposition']).toContain(`attachment; filename="attendees-${eventId}.csv"`)
      expect(res.text).toContain('RSVP ID,Name,Email,Roll Number,Branch,Year,Status,Created At,Answers')
      expect(res.text).toContain('"John, Doe"') // escaped comma
    })

    it('consumes validated status filter in CSV export and passes it to Prisma', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.findMany).mockResolvedValue([])

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps/export?status=approved`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(prisma.rsvp.findMany).toHaveBeenCalledWith({
        where: { eventId, status: 'approved' },
        orderBy: { createdAt: 'asc' },
        include: expect.any(Object),
      })
    })

    it('rejects invalid status filter in export without calling Prisma', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvp.findMany).mockClear()

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/rsvps/export?status=unknown`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('VALIDATION')
      expect(prisma.rsvp.findMany).not.toHaveBeenCalled()
    })
  })
})
