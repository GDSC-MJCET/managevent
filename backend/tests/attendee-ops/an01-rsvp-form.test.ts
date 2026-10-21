import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../src/app.js'
import { prisma } from '../../src/db/index.js'
import {
  PutRsvpFormBodySchema,
  RsvpFormFieldInputSchema,
} from '../../src/modules/attendee-ops/schema.js'
import { createTestJwt } from '../helpers/auth.js'

vi.mock('../../src/db/index.js', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    event: {
      findUnique: vi.fn(),
    },
    rsvpFormField: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(mockPrisma)
    }),
  }
  return {
    prisma: mockPrisma,
    connectDatabase: vi.fn(),
    disconnectDatabase: vi.fn(),
  }
})

describe('AN-01: Custom RSVP Form Contract & API', () => {
  const validEventId = 'e1a2b3c4-0000-0000-0000-000000000001'
  const ownerId = 'u1a2b3c4-0000-0000-0000-000000000001'
  const nonOwnerId = 'u2b3c4d5-0000-0000-0000-000000000002'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Zod Schema Validation', () => {
    it('accepts all 5 valid question types', () => {
      const types = ['text', 'textarea', 'number', 'select', 'checkbox'] as const
      for (const type of types) {
        const payload = {
          label: `Sample ${type}`,
          type,
          required: false,
          position: 0,
          options: type === 'select' ? ['Choice A', 'Choice B'] : undefined,
        }
        const result = RsvpFormFieldInputSchema.safeParse(payload)
        expect(result.success).toBe(true)
      }
    })

    it('treats checkbox as boolean question without options', () => {
      const payload = {
        label: 'Will you bring your own laptop?',
        type: 'checkbox',
        required: true,
        position: 0,
      }
      const result = RsvpFormFieldInputSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it('rejects options on checkbox questions', () => {
      const payload = {
        label: 'Will you bring your own laptop?',
        type: 'checkbox',
        required: true,
        position: 0,
        options: ['Yes', 'No'],
      }
      const result = RsvpFormFieldInputSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it('rejects invalid field types', () => {
      const payload = {
        label: 'Color',
        type: 'radio_group',
        required: true,
        position: 0,
      }
      const result = RsvpFormFieldInputSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it('requires at least 2 options for select field', () => {
      const payload1 = {
        label: 'Pick one',
        type: 'select',
        required: true,
        position: 0,
        options: ['Only one'],
      }
      const result1 = RsvpFormFieldInputSchema.safeParse(payload1)
      expect(result1.success).toBe(false)

      const payload2 = {
        label: 'Pick one',
        type: 'select',
        required: true,
        position: 0,
      }
      const result2 = RsvpFormFieldInputSchema.safeParse(payload2)
      expect(result2.success).toBe(false)
    })

    it('rejects empty string in options', () => {
      const payload = {
        label: 'Branch',
        type: 'select',
        required: true,
        position: 0,
        options: ['CSE', ''],
      }
      const result = RsvpFormFieldInputSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it('rejects options on text or number fields', () => {
      const payload = {
        label: 'Your Name',
        type: 'text',
        required: true,
        position: 0,
        options: ['Invalid'],
      }
      const result = RsvpFormFieldInputSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it('rejects form exceeding 20 fields cap', () => {
      const fields = Array.from({ length: 21 }, (_, i) => ({
        label: `Field ${i}`,
        type: 'text' as const,
        required: false,
        position: i,
      }))
      const result = PutRsvpFormBodySchema.safeParse({ fields })
      expect(result.success).toBe(false)
    })
  })

  describe('GET /api/events/:id/rsvp-form', () => {
    it('returns 404 when event does not exist', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null)

      const res = await request(app).get(`/api/events/${validEventId}/rsvp-form`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({
        ok: false,
        data: null,
        error: {
          code: 'NOT_FOUND',
          message: 'Event not found',
        },
      })
    })

    it('returns 403 for draft event when caller is unauthenticated', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        status: 'draft',
        club: { ownerId },
      } as any)

      const res = await request(app).get(`/api/events/${validEventId}/rsvp-form`)

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 403 for draft event when caller is non-owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        status: 'draft',
        club: { ownerId },
      } as any)

      const nonOwnerToken = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${validEventId}/rsvp-form`)
        .set('Authorization', `Bearer ${nonOwnerToken}`)

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('allows club owner to view draft event rsvp-form', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        status: 'draft',
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvpFormField.findMany).mockResolvedValue([
        {
          id: 'f1',
          eventId: validEventId,
          label: 'Laptop required?',
          type: 'checkbox',
          required: false,
          position: 0,
          options: null,
        },
      ] as any)

      const ownerToken = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .get(`/api/events/${validEventId}/rsvp-form`)
        .set('Authorization', `Bearer ${ownerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.fields).toHaveLength(1)
    })

    it('returns saved questions for open event without authentication', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        status: 'open',
        club: { ownerId },
      } as any)
      vi.mocked(prisma.rsvpFormField.findMany).mockResolvedValue([
        {
          id: 'f1',
          eventId: validEventId,
          label: 'Branch',
          type: 'select',
          required: true,
          position: 0,
          options: ['CSE', 'IT', 'ECE'],
        },
        {
          id: 'f2',
          eventId: validEventId,
          label: 'GitHub URL',
          type: 'text',
          required: false,
          position: 1,
          options: null,
        },
      ] as any)

      const res = await request(app).get(`/api/events/${validEventId}/rsvp-form`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.eventId).toBe(validEventId)
      expect(res.body.data.fields).toHaveLength(2)
      expect(res.body.data.fields[0].position).toBe(0)
      expect(res.body.data.fields[0].options).toEqual(['CSE', 'IT', 'ECE'])
      expect(res.body.data.fields[1].options).toBeNull()
      expect(res.body.error).toBeNull()
    })
  })

  describe('PUT /api/events/:id/rsvp-form', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .put(`/api/events/${validEventId}/rsvp-form`)
        .send({ fields: [] })

      expect(res.status).toBe(401)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 403 when user is not the club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        club: { ownerId },
      } as any)

      const nonOwnerToken = createTestJwt(nonOwnerId, 'club_admin')
      const res = await request(app)
        .put(`/api/events/${validEventId}/rsvp-form`)
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ fields: [] })

      expect(res.status).toBe(403)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 400 VALIDATION on malformed payload', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        club: { ownerId },
      } as any)

      const ownerToken = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .put(`/api/events/${validEventId}/rsvp-form`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          fields: [
            {
              label: 'Year',
              type: 'select',
              required: true,
              position: 0,
              options: ['Only 1 option'],
            },
          ],
        })

      expect(res.status).toBe(400)
      expect(res.body.ok).toBe(false)
      expect(res.body.error.code).toBe('VALIDATION')
    })

    it('replaces questions and returns 200 with saved fields for club owner', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: validEventId,
        club: { ownerId },
      } as any)

      const savedFields = [
        {
          id: 'field-1',
          eventId: validEventId,
          label: 'Year of study',
          type: 'select',
          required: true,
          position: 0,
          options: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
        },
        {
          id: 'field-2',
          eventId: validEventId,
          label: 'Laptop required?',
          type: 'checkbox',
          required: true,
          position: 1,
          options: null,
        },
      ]

      vi.mocked(prisma.rsvpFormField.deleteMany).mockResolvedValue({ count: 2 } as any)
      vi.mocked(prisma.rsvpFormField.createMany).mockResolvedValue({ count: 2 } as any)
      vi.mocked(prisma.rsvpFormField.findMany).mockResolvedValue(savedFields as any)

      const ownerToken = createTestJwt(ownerId, 'club_admin')
      const res = await request(app)
        .put(`/api/events/${validEventId}/rsvp-form`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          fields: [
            {
              label: 'Year of study',
              type: 'select',
              required: true,
              position: 0,
              options: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
            },
            {
              label: 'Laptop required?',
              type: 'checkbox',
              required: true,
              position: 1,
            },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.fields).toHaveLength(2)
      expect(res.body.data.fields[0].label).toBe('Year of study')
      expect(res.body.data.fields[0].options).toEqual(['1st Year', '2nd Year', '3rd Year', '4th Year'])
      expect(res.body.data.fields[1].options).toBeNull()
      expect(res.body.error).toBeNull()
    })
  })
})
