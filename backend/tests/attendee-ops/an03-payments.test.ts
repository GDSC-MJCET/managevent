import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db/index.js'
import { createTestJwt } from '../helpers/auth.js'
import { setRsvpTransitionService } from '../../src/modules/attendee-ops/services/rsvpTransitionProvider.js'
import type { IRsvpTransitionService } from '../../src/modules/attendee-ops/contracts/rsvpTransition.js'
import { PatchPaymentBodySchema } from '../../src/modules/attendee-ops/schema.js'

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
    payment: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  }
  return {
    prisma: mockPrisma,
    connectDatabase: vi.fn(),
    disconnectDatabase: vi.fn(),
  }
})

describe('AN-03: Payment Verification API', () => {
  const eventId = 'e1a2b3c4-0000-4000-8000-000000000001'
  const ownerId = 'b1a2b3c4-0000-4000-8000-000000000001'
  const nonOwnerId = 'b2b3c4d5-0000-4000-8000-000000000002'
  const rsvpId = 'c1a2b3c4-0000-4000-8000-000000000001'
  const paymentId = 'd1a2b3c4-0000-4000-8000-000000000001'

  let mockTransitionService: IRsvpTransitionService

  beforeEach(() => {
    vi.clearAllMocks()

    mockTransitionService = {
      transition: vi.fn().mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId,
          eventId,
          userId: 'u100',
          status: 'approved',
        },
      }),
    }

    setRsvpTransitionService(mockTransitionService)
  })

  describe('Zod Schema Validation for Payments', () => {
    it('accepts verified status without rejectReason', () => {
      const result = PatchPaymentBodySchema.safeParse({ status: 'verified' })
      expect(result.success).toBe(true)
    })

    it('accepts rejected status with valid rejectReason', () => {
      const result = PatchPaymentBodySchema.safeParse({
        status: 'rejected',
        rejectReason: 'Screenshot is blurry and unreadable',
      })
      expect(result.success).toBe(true)
    })

    it('rejects rejected status when rejectReason is missing or empty (BR-R6)', () => {
      const resultMissing = PatchPaymentBodySchema.safeParse({ status: 'rejected' })
      expect(resultMissing.success).toBe(false)

      const resultEmpty = PatchPaymentBodySchema.safeParse({
        status: 'rejected',
        rejectReason: '   ',
      })
      expect(resultEmpty.success).toBe(false)
    })

    it('rejects invalid status values', () => {
      const result = PatchPaymentBodySchema.safeParse({ status: 'pending' })
      expect(result.success).toBe(false)
    })
  })

  describe('GET /api/events/:id/payments', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/events/${eventId}/payments`)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 403 when caller is not the club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/payments`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns payment queue with RSVP and attendee details for club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: eventId,
        club: { ownerId },
      } as any)

      vi.mocked(prisma.payment.count).mockResolvedValue(1)
      vi.mocked(prisma.payment.findMany).mockResolvedValue([
        {
          id: paymentId,
          rsvpId,
          screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          status: 'pending',
          rejectReason: null,
          verifiedBy: null,
          verifiedAt: null,
          createdAt: new Date('2026-10-22T00:00:00.000Z'),
          rsvp: {
            id: rsvpId,
            userId: 'u100',
            status: 'pending',
            answers: { Branch: 'CSE' },
            user: {
              name: 'John Doe',
              email: 'john@example.com',
              rollNumber: '1604-22-733-001',
              branch: 'CSE',
              year: 3,
            },
          },
        },
      ] as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${eventId}/payments?page=1&limit=20&status=pending`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.total).toBe(1)
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.items[0].id).toBe(paymentId)
      expect(res.body.data.items[0].screenshotUrl).toBe('https://res.cloudinary.com/demo/image/upload/sample.jpg')
      expect(res.body.data.items[0].rsvp.user.name).toBe('John Doe')
      expect(res.body.error).toBeNull()
    })
  })

  describe('PATCH /api/payments/:rsvpId', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 404 when payment record does not exist', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(null)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 403 when caller is not the club owner of the payment event', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      const token = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 400 VALIDATION when rejecting without a reason (BR-R6)', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'rejected' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION')
    })

    it('verifies payment in auto approval mode when capacity remains (BR-R5, BR-R10) -> approved', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        status: 'pending',
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId,
          eventId,
          userId: 'u100',
          status: 'approved',
        },
      })

      const verifiedAt = new Date('2026-10-22T00:05:00.000Z')
      vi.mocked(prisma.payment.update).mockResolvedValue({
        id: paymentId,
        rsvpId,
        screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        status: 'verified',
        rejectReason: null,
        verifiedBy: ownerId,
        verifiedAt,
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.status).toBe('verified')
      expect(res.body.data.verifiedBy).toBe(ownerId)
      expect(res.body.data.rsvpStatus).toBe('approved')

      // Verified call to Ali's transition engine with payment_verified
      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId,
        toStatus: 'payment_verified',
        actorId: ownerId,
        reason: undefined,
      })
    })

    it('verifies payment in auto approval mode when capacity is full (BR-R5, BR-R10) -> waitlist', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        status: 'pending',
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      // Ali's engine determines capacity is full and places RSVP on waitlist
      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId,
          eventId,
          userId: 'u100',
          status: 'waitlist',
        },
      })

      const verifiedAt = new Date('2026-10-22T00:05:00.000Z')
      vi.mocked(prisma.payment.update).mockResolvedValue({
        id: paymentId,
        rsvpId,
        screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        status: 'verified',
        rejectReason: null,
        verifiedBy: ownerId,
        verifiedAt,
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.status).toBe('verified')
      expect(res.body.data.rsvpStatus).toBe('waitlist')

      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId,
        toStatus: 'payment_verified',
        actorId: ownerId,
        reason: undefined,
      })
    })

    it('verifies payment in manual approval mode (BR-R5, BR-R10) -> retains pending RSVP', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        status: 'pending',
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      // Ali's engine evaluates manual mode: leaves RSVP pending until club explicitly approves
      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId,
          eventId,
          userId: 'u100',
          status: 'pending',
        },
      })

      const verifiedAt = new Date('2026-10-22T00:05:00.000Z')
      vi.mocked(prisma.payment.update).mockResolvedValue({
        id: paymentId,
        rsvpId,
        screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        status: 'verified',
        rejectReason: null,
        verifiedBy: ownerId,
        verifiedAt,
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.status).toBe('verified')
      expect(res.body.data.rsvpStatus).toBe('pending')

      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId,
        toStatus: 'payment_verified',
        actorId: ownerId,
        reason: undefined,
      })
    })

    it('rejects payment with reason, keeps RSVP pending so student can resubmit screenshot (BR-R6, BR-R10)', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        status: 'pending',
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      // Under BR-R6, payment rejection leaves RSVP in pending state rather than terminating it
      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId,
          eventId,
          userId: 'u100',
          status: 'pending',
        },
      })

      const verifiedAt = new Date('2026-10-22T00:05:00.000Z')
      vi.mocked(prisma.payment.update).mockResolvedValue({
        id: paymentId,
        rsvpId,
        screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        status: 'rejected',
        rejectReason: 'UTR number already used',
        verifiedBy: ownerId,
        verifiedAt,
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      } as any)

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'rejected', rejectReason: 'UTR number already used' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.status).toBe('rejected')
      expect(res.body.data.rejectReason).toBe('UTR number already used')
      expect(res.body.data.rsvpStatus).toBe('pending')

      // Verified call to Ali's transition engine with payment_rejected and reason
      expect(mockTransitionService.transition).toHaveBeenCalledWith({
        rsvpId,
        toStatus: 'payment_rejected',
        actorId: ownerId,
        reason: 'UTR number already used',
      })
    })

    it('executes compensating rollback to pending when RSVP transition succeeds but payment update fails (Consistency)', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: paymentId,
        rsvpId,
        status: 'pending',
        rsvp: {
          event: {
            club: { ownerId },
          },
        },
      } as any)

      vi.mocked(mockTransitionService.transition).mockResolvedValue({
        success: true,
        rsvp: {
          id: rsvpId,
          eventId,
          userId: 'u100',
          status: 'approved',
        },
      })

      // Simulate database failure during payment update
      vi.mocked(prisma.payment.update).mockRejectedValue(new Error('DB Connection Timeout'))

      const token = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .patch(`/api/payments/${rsvpId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'verified' })

      expect(res.status).toBe(500)

      // Verified compensating rollback call was made to revert RSVP to pending
      expect(mockTransitionService.transition).toHaveBeenCalledTimes(2)
      expect(mockTransitionService.transition).toHaveBeenNthCalledWith(1, {
        rsvpId,
        toStatus: 'payment_verified',
        actorId: ownerId,
        reason: undefined,
      })
      expect(mockTransitionService.transition).toHaveBeenNthCalledWith(2, {
        rsvpId,
        toStatus: 'pending',
        actorId: ownerId,
        reason: 'Compensating rollback: payment record update failed after RSVP transition',
      })
    })

    it('confirms student resubmission flow returns payment status to pending and preserves RSVP eligibility (BR-R6)', async () => {
      // Step 1: Payment was previously rejected and student resubmits a new screenshot
      // Resubmission updates the payment record to pending with the new screenshot and clears rejectReason
      const resubmittedPayment = {
        id: paymentId,
        rsvpId,
        screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/new-receipt.jpg',
        status: 'pending',
        rejectReason: null,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
        rsvp: {
          id: rsvpId,
          userId: 'u100',
          status: 'pending',
          answers: null,
          user: {
            name: 'Jane Doe',
            email: 'jane@mjcet.ac.in',
            rollNumber: '1604-22-733-002',
            branch: 'CSE',
            year: 3,
          },
        },
      }

      vi.mocked(prisma.payment.count).mockResolvedValue(1)
      vi.mocked(prisma.payment.findMany).mockResolvedValue([resubmittedPayment] as any)

      const token = createTestJwt(ownerId, 'club_admin')
      // Step 2: The resubmitted payment now re-appears in the club owner's pending verification queue
      const res = await request(app)
        .get(`/api/events/${eventId}/payments?status=pending`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.total).toBe(1)
      expect(res.body.data.items[0].status).toBe('pending')
      expect(res.body.data.items[0].screenshotUrl).toBe('https://res.cloudinary.com/demo/image/upload/new-receipt.jpg')
      expect(res.body.data.items[0].rejectReason).toBeNull()
      expect(res.body.data.items[0].rsvp.status).toBe('pending')
    })
  })
})
