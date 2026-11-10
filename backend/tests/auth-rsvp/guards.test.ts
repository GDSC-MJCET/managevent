import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextFunction, Request } from 'express'
import { harness } from '../helpers/prismaHarness.js'

vi.mock('../../src/db/index.js', () => ({
  prisma: harness.mock,
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { requireAuth, requireRole, requireClubOwner, requireApprovedAttendee } from '../../src/middleware/auth.js'
import { createTestJwt } from '../helpers/auth.js'

function runMiddleware(mw: (req: Request, res: any, next: NextFunction) => unknown, req: Request): Promise<unknown> {
  return new Promise((resolve) => {
    const next = (err?: unknown): void => resolve(err ?? null)
    void mw(req, { headers: {} } as never, next as NextFunction)
  })
}

const authHeader = (token: string): any => ({
  headers: { authorization: `Bearer ${token}` },
})

// Direct middleware calls skip requireAuth, so req.user is set manually.
function authReq(
  userId: string,
  role: 'student' | 'club_admin' | 'super_admin',
  params?: Record<string, string>,
): Request {
  return { headers: { authorization: `Bearer ${createTestJwt(userId, role)}` }, user: { id: userId, role }, params } as unknown as Request
}

describe('AL-04: route guards', () => {
  beforeEach(() => {
    harness.reset()
  })

  describe('requireApprovedAttendee', () => {
    const eventUuid = '1a2b3c4d-0000-0000-0000-000000000001'
    const studentUuid = '2b3c4d5e-0000-0000-0000-000000000002'
    const ownerUuid = '3c4d5e6f-0000-0000-0000-000000000003'
    const otherUserUuid = '4d5e6f70-0000-0000-0000-000000000004'

    it('401 UNAUTHENTICATED when called without req.user', async () => {
      const err = await runMiddleware(requireApprovedAttendee, {
        params: { id: eventUuid },
      } as unknown as Request)
      expect(err).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
    })

    it('VALIDATION on a malformed event id', async () => {
      const req = authReq(studentUuid, 'student', { id: 'nope' })
      const err = await runMiddleware(requireApprovedAttendee, req)
      expect(err).toMatchObject({ code: 'VALIDATION' })
    })

    it('404 when the event does not exist', async () => {
      const req = authReq(studentUuid, 'student', { id: eventUuid })
      const err = await runMiddleware(requireApprovedAttendee, req)
      expect(err).toMatchObject({ code: 'NOT_FOUND', status: 404 })
    })

    it('403 NOT_APPROVED without an approved RSVP', async () => {
      harness.seedEvent({ id: eventUuid, club: { ownerId: ownerUuid } })
      harness.seedRsvp({ eventId: eventUuid, userId: studentUuid, status: 'pending' })

      const req = authReq(studentUuid, 'student', { id: eventUuid })
      const err = await runMiddleware(requireApprovedAttendee, req)
      expect(err).toMatchObject({ code: 'NOT_APPROVED', status: 403 })
    })

    it('passes with an approved RSVP', async () => {
      harness.seedEvent({ id: eventUuid, club: { ownerId: ownerUuid } })
      harness.seedRsvp({ eventId: eventUuid, userId: otherUserUuid, status: 'approved' })

      const req = authReq(otherUserUuid, 'student', { id: eventUuid })
      const err = await runMiddleware(requireApprovedAttendee, req)
      expect(err).toBeNull()
    })

    it('club owner always passes without an RSVP', async () => {
      harness.seedEvent({ id: eventUuid, club: { ownerId: ownerUuid } })

      const req = authReq(ownerUuid, 'club_admin', { id: eventUuid })
      const err = await runMiddleware(requireApprovedAttendee, req)
      expect(err).toBeNull()
    })
  })

  describe('requireRole', () => {
    const middleware = requireRole('club_admin', 'super_admin')

    it('401 without a user', async () => {
      const err = await runMiddleware(middleware, {} as unknown as Request)
      expect(err).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
    })

    it('403 for a mismatched role', async () => {
      const req = { user: { id: 'a'.repeat(36), role: 'student' } } as unknown as Request
      const err = await runMiddleware(middleware, req)
      expect(err).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    })

    it('passes for an allowed role', async () => {
      const req = { user: { id: 'b'.repeat(36), role: 'club_admin' } } as unknown as Request
      const err = await runMiddleware(middleware, req)
      expect(err).toBeNull()
    })
  })

  describe('requireClubOwner', () => {
    const ownerUuid = '3c4d5e6f-0000-0000-0000-000000000003'
    const clubAdminUuid = '4d5e6f70-0000-0000-0000-000000000004'

    it('passes for the owning club', async () => {
      harness.seedEvent({
        id: '1a2b3c4d-0000-0000-0000-000000000001',
        club: { ownerId: ownerUuid },
      })

      const req = authReq(ownerUuid, 'club_admin', { id: '1a2b3c4d-0000-0000-0000-000000000001' })
      const err = await runMiddleware(requireClubOwner, req)
      expect(err).toBeNull()
    })

    it('403 for a different club owner', async () => {
      harness.seedEvent({
        id: '1a2b3c4d-0000-0000-0000-000000000002',
        club: { ownerId: ownerUuid },
      })

      const req = authReq(clubAdminUuid, 'club_admin', { id: '1a2b3c4d-0000-0000-0000-000000000002' })
      const err = await runMiddleware(requireClubOwner, req)
      expect(err).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    })
  })

  describe('fake-user mode (AL-04 ship-day requirement)', () => {
    it('requireAuth fabricates a demo student when enabled', async () => {
      const prev = process.env.FAKE_CLIENT_AUTH
      process.env.FAKE_CLIENT_AUTH = 'true'
      try {
        vi.resetModules()
        const mod = await import('../../src/middleware/auth.js')
        const req = { headers: {} } as unknown as Request

        const err = await runMiddleware(mod.requireAuth as typeof requireAuth, req)
        expect(err).toBeNull()
        expect(req.user).toMatchObject({ role: 'student' })

        // BR-L1 prep: requireApprovedAttendee passes in mock mode
        const approved = await runMiddleware(
          mod.requireApprovedAttendee as typeof requireApprovedAttendee,
          { ...req, params: { id: '1a2b3c4d-0000-0000-0000-000000000009' } } as unknown as Request,
        )
        expect(approved).toBeNull()
      } finally {
        process.env.FAKE_CLIENT_AUTH = prev
        vi.resetModules()
      }
    })
  })
})
