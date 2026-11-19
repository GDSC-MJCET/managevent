import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

// Setup mocked prisma
const mockPrisma = {
  event: {
    findUnique: vi.fn(),
  },
  galleryItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('../../src/db/index.js', () => ({
  prisma: mockPrisma,
}))

// Import Express app after mocking prisma
const { app } = await import('../../src/app.js')

describe('AD-01: Gallery API Endpoints', () => {
  const OWNER_ID = '11111111-1111-4111-8111-111111111111'
  const NON_OWNER_ID = '22222222-2222-4222-8222-222222222222'
  const STUDENT_ID = '33333333-3333-4333-8333-333333333333'
  const EVENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const ITEM_ID_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  const ITEM_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'

  const endedEvent = {
    id: EVENT_ID,
    title: 'MJCET Hackathon 2026',
    status: 'ended',
    club: {
      id: 'club-uuid-1',
      ownerId: OWNER_ID,
    },
  }

  const liveEvent = {
    id: EVENT_ID,
    title: 'MJCET Hackathon 2026',
    status: 'live',
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

  // ── 1. Successful bulk gallery creation ──────────────────────────────────
  it('1. POST /api/events/:id/gallery - successfully bulk-creates gallery items', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(endedEvent)
    mockPrisma.galleryItem.create
      .mockResolvedValueOnce({
        id: ITEM_ID_1,
        eventId: EVENT_ID,
        fileUrl: 'https://images.unsplash.com/photo-1.jpg',
        caption: 'Keynote',
        position: 0,
      })
      .mockResolvedValueOnce({
        id: ITEM_ID_2,
        eventId: EVENT_ID,
        fileUrl: 'https://images.unsplash.com/photo-2.jpg',
        caption: null,
        position: 1,
      })

    const payload = {
      items: [
        {
          file_url: 'https://images.unsplash.com/photo-1.jpg',
          caption: 'Keynote',
          position: 0,
        },
        {
          file_url: 'https://images.unsplash.com/photo-2.jpg',
          caption: null,
          position: 1,
        },
      ],
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.items).toHaveLength(2)
    expect(res.body.data.items[0]).toEqual({
      id: ITEM_ID_1,
      event_id: EVENT_ID,
      file_url: 'https://images.unsplash.com/photo-1.jpg',
      caption: 'Keynote',
      position: 0,
    })
    expect(res.body.error).toBeNull()
  })

  // ── 2. Rejection when event has not ended (BR-P1) ────────────────────────
  it('2. POST /api/events/:id/gallery - rejects with RECAP_LOCKED if event is not ended', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(liveEvent)

    const payload = {
      items: [
        {
          file_url: 'https://images.unsplash.com/photo-1.jpg',
          caption: 'Live shot',
          position: 0,
        },
      ],
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(409)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('RECAP_LOCKED')
    expect(mockPrisma.galleryItem.create).not.toHaveBeenCalled()
  })

  // ── 3. Invalid or missing request data ───────────────────────────────────
  it('3. POST /api/events/:id/gallery - rejects invalid or empty body with VALIDATION', async () => {
    const resEmpty = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({ items: [] })

    expect(resEmpty.status).toBe(400)
    expect(resEmpty.body.ok).toBe(false)
    expect(resEmpty.body.error.code).toBe('VALIDATION')

    const resBadUrl = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({
        items: [
          {
            file_url: 'not-a-url',
            position: -5,
          },
        ],
      })

    expect(resBadUrl.status).toBe(400)
    expect(resBadUrl.body.ok).toBe(false)
    expect(resBadUrl.body.error.code).toBe('VALIDATION')
  })

  // ── 4. Unauthorized club administrator (non-owner) ──────────────────────
  it('4. POST /api/events/:id/gallery - rejects non-owner club_admin with FORBIDDEN', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(endedEvent)

    const payload = {
      items: [
        {
          file_url: 'https://images.unsplash.com/photo-1.jpg',
          position: 0,
        },
      ],
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', NON_OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(mockPrisma.galleryItem.create).not.toHaveBeenCalled()
  })

  // ── 5. Unauthenticated request ──────────────────────────────────────────
  it('5. POST /api/events/:id/gallery - rejects unauthenticated request with UNAUTHENTICATED', async () => {
    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .send({
        items: [
          {
            file_url: 'https://images.unsplash.com/photo-1.jpg',
            position: 0,
          },
        ],
      })

    expect(res.status).toBe(401)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  // ── 6. Successful caption and position updates ───────────────────────────
  it('6. PATCH /api/events/:id/gallery - successfully updates captions and positions', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(endedEvent)
    mockPrisma.galleryItem.findMany.mockResolvedValue([
      { id: ITEM_ID_1, eventId: EVENT_ID },
      { id: ITEM_ID_2, eventId: EVENT_ID },
    ])
    mockPrisma.galleryItem.update
      .mockResolvedValueOnce({
        id: ITEM_ID_1,
        eventId: EVENT_ID,
        fileUrl: 'https://images.unsplash.com/photo-1.jpg',
        caption: 'New Caption 1',
        position: 1,
      })
      .mockResolvedValueOnce({
        id: ITEM_ID_2,
        eventId: EVENT_ID,
        fileUrl: 'https://images.unsplash.com/photo-2.jpg',
        caption: null,
        position: 0,
      })

    const payload = {
      items: [
        { id: ITEM_ID_1, caption: 'New Caption 1', position: 1 },
        { id: ITEM_ID_2, caption: null, position: 0 },
      ],
    }

    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.updated).toBe(2)
    expect(res.body.data.items).toHaveLength(2)
    expect(res.body.error).toBeNull()
  })

  // ── 7. Rejection of gallery items belonging to another event ─────────────
  it('7. PATCH /api/events/:id/gallery - rejects when items do not belong to event', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(endedEvent)
    // Only one item belongs to this event in the database
    mockPrisma.galleryItem.findMany.mockResolvedValue([
      { id: ITEM_ID_1, eventId: EVENT_ID },
    ])

    const payload = {
      items: [
        { id: ITEM_ID_1, caption: 'Caption 1' },
        { id: ITEM_ID_2, caption: 'Caption 2' },
      ],
    }

    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(mockPrisma.galleryItem.update).not.toHaveBeenCalled()
  })

  // ── 8. Successful deletion ───────────────────────────────────────────────
  it('8. DELETE /api/gallery/:id - successfully deletes an item', async () => {
    mockPrisma.galleryItem.findUnique.mockResolvedValue({
      id: ITEM_ID_1,
      eventId: EVENT_ID,
      event: endedEvent,
    })
    mockPrisma.galleryItem.delete.mockResolvedValue({ id: ITEM_ID_1 })

    const res = await request(app)
      .delete(`/api/gallery/${ITEM_ID_1}`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.deleted).toBe(true)
    expect(res.body.data.id).toBe(ITEM_ID_1)
    expect(mockPrisma.galleryItem.delete).toHaveBeenCalledWith({
      where: { id: ITEM_ID_1 },
    })
  })

  // ── 9. Deletion of a nonexistent gallery item ────────────────────────────
  it('9. DELETE /api/gallery/:id - returns NOT_FOUND if item does not exist', async () => {
    mockPrisma.galleryItem.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .delete(`/api/gallery/${ITEM_ID_1}`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(mockPrisma.galleryItem.delete).not.toHaveBeenCalled()
  })

  // ── 10. Deletion by an unauthorized user ─────────────────────────────────
  it('10. DELETE /api/gallery/:id - rejects deletion by non-owner with FORBIDDEN', async () => {
    mockPrisma.galleryItem.findUnique.mockResolvedValue({
      id: ITEM_ID_1,
      eventId: EVENT_ID,
      event: endedEvent,
    })

    const res = await request(app)
      .delete(`/api/gallery/${ITEM_ID_1}`)
      .set('x-user-id', NON_OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(mockPrisma.galleryItem.delete).not.toHaveBeenCalled()
  })

  // ── 11. Invalid UUIDs in route params ────────────────────────────────────
  it('11. Rejects invalid UUIDs in route params with VALIDATION error', async () => {
    const resPost = await request(app)
      .post('/api/events/not-a-valid-uuid/gallery')
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send({
        items: [
          {
            file_url: 'https://images.unsplash.com/photo-1.jpg',
            position: 0,
          },
        ],
      })

    expect(resPost.status).toBe(400)
    expect(resPost.body.error.code).toBe('VALIDATION')

    const resDelete = await request(app)
      .delete('/api/gallery/invalid-id')
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')

    expect(resDelete.status).toBe(400)
    expect(resDelete.body.error.code).toBe('VALIDATION')
  })

  // ── 12. Duplicate gallery item IDs in update payload ─────────────────────
  it('12. PATCH /api/events/:id/gallery - rejects duplicate IDs in payload', async () => {
    const payload = {
      items: [
        { id: ITEM_ID_1, position: 0 },
        { id: ITEM_ID_1, position: 1 },
      ],
    }

    const res = await request(app)
      .patch(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION')
    expect(res.body.error.message).toContain('Duplicate gallery item id')
  })

  // ── 13. Transactional failure behavior ───────────────────────────────────
  it('13. POST /api/events/:id/gallery - handles transactional errors gracefully', async () => {
    mockPrisma.event.findUnique.mockResolvedValue(endedEvent)
    mockPrisma.$transaction.mockRejectedValueOnce(
      new Error('Database transaction failed unexpectedly'),
    )

    const payload = {
      items: [
        {
          file_url: 'https://images.unsplash.com/photo-1.jpg',
          position: 0,
        },
      ],
    }

    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', OWNER_ID)
      .set('x-user-role', 'club_admin')
      .send(payload)

    expect(res.status).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('INTERNAL')
  })

  // ── Bonus: Non-club-admin role rejected (e.g., student role) ────────────
  it('POST /api/events/:id/gallery - rejects student role with FORBIDDEN', async () => {
    const res = await request(app)
      .post(`/api/events/${EVENT_ID}/gallery`)
      .set('x-user-id', STUDENT_ID)
      .set('x-user-role', 'student')
      .send({
        items: [
          {
            file_url: 'https://images.unsplash.com/photo-1.jpg',
            position: 0,
          },
        ],
      })

    expect(res.status).toBe(403)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})
