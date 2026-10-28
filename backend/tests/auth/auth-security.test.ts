import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import {
  verifyJwtToken,
  parseOptionalAuth,
  requireAuth,
  requireRole,
} from '../../src/middleware/auth.js'
import { createTestJwt } from '../helpers/auth.js'
import { ApiError } from '../../src/lib/errors.js'

describe('Authentication Hardening & Security Review (Phase A)', () => {
  const userId = '11111111-2222-4333-8444-555555555555'

  describe('verifyJwtToken', () => {
    it('successfully verifies a valid unexpired token with 7-day lifetime', () => {
      const token = createTestJwt(userId, 'student')
      const result = verifyJwtToken(token)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(userId)
      expect(result?.role).toBe('student')
    })

    it('rejects an expired token', () => {
      const pastSec = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      const expiredToken = createTestJwt(userId, 'student', { exp: pastSec })

      const result = verifyJwtToken(expiredToken)
      expect(result).toBeNull()
    })

    it('rejects a token signed with the wrong secret', () => {
      const wrongSecretToken = createTestJwt(userId, 'student', {
        secret: 'a-completely-different-wrong-secret-32-chars!',
      })

      const result = verifyJwtToken(wrongSecretToken)
      expect(result).toBeNull()
    })

    it('rejects a token with an unexpected signing algorithm', () => {
      const noneAlgToken = createTestJwt(userId, 'student', { alg: 'none' })

      const result = verifyJwtToken(noneAlgToken)
      expect(result).toBeNull()
    })

    it('rejects a token with missing or non-integer exp claim', () => {
      const tokenWithoutExp = createTestJwt(userId, 'student', {
        extraClaims: { exp: undefined },
      })

      const result = verifyJwtToken(tokenWithoutExp)
      expect(result).toBeNull()
    })

    it('rejects a token with an invalid role', () => {
      const tokenWithInvalidRole = createTestJwt(userId, 'hacker' as any)

      const result = verifyJwtToken(tokenWithInvalidRole)
      expect(result).toBeNull()
    })

    it('rejects a token with blank or missing sub', () => {
      const tokenWithoutSub = createTestJwt('', 'student')

      const result = verifyJwtToken(tokenWithoutSub)
      expect(result).toBeNull()
    })

    it('rejects malformed tokens', () => {
      expect(verifyJwtToken('not-a-token')).toBeNull()
      expect(verifyJwtToken('a.b')).toBeNull()
      expect(verifyJwtToken('a.b.c.d')).toBeNull()
      expect(verifyJwtToken('invalid.payload.sig')).toBeNull()
    })
  })

  describe('requireAuth middleware', () => {
    it('calls next() when valid Bearer token is provided', () => {
      const token = createTestJwt(userId, 'club_admin')
      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn()

      requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.user).toEqual({ id: userId, role: 'club_admin' })
    })

    it('throws ApiError UNAUTHENTICATED when authorization header is missing', () => {
      const req = { headers: {} } as Request
      const res = {} as Response
      const next = vi.fn()

      requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(ApiError))
      const err = next.mock.calls[0][0] as ApiError
      expect(err.code).toBe('UNAUTHENTICATED')
    })

    it('throws ApiError UNAUTHENTICATED when token is expired', () => {
      const expiredToken = createTestJwt(userId, 'student', {
        exp: Math.floor(Date.now() / 1000) - 100,
      })
      const req = {
        headers: { authorization: `Bearer ${expiredToken}` },
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn()

      requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(ApiError))
      const err = next.mock.calls[0][0] as ApiError
      expect(err.code).toBe('UNAUTHENTICATED')
    })

    it('throws ApiError UNAUTHENTICATED when token is exactly at the exp second boundary (nowSec === exp)', () => {
      const nowSec = Math.floor(Date.now() / 1000)
      const boundaryToken = createTestJwt(userId, 'student', {
        exp: nowSec,
      })
      const req = {
        headers: { authorization: `Bearer ${boundaryToken}` },
      } as unknown as Request
      const res = {} as Response
      const next = vi.fn()

      requireAuth(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(ApiError))
      const err = next.mock.calls[0][0] as ApiError
      expect(err.code).toBe('UNAUTHENTICATED')
    })
  })

  describe('parseOptionalAuth helper', () => {
    it('populates req.user when valid token is provided', () => {
      const token = createTestJwt(userId, 'student')
      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as unknown as Request

      parseOptionalAuth(req)

      expect(req.user).toEqual({ id: userId, role: 'student' })
    })

    it('leaves req.user undefined when no authorization header is present', () => {
      const req = { headers: {} } as Request

      parseOptionalAuth(req)

      expect(req.user).toBeUndefined()
    })

    it('leaves req.user undefined when invalid token is provided', () => {
      const req = {
        headers: { authorization: 'Bearer invalid-token' },
      } as unknown as Request

      parseOptionalAuth(req)

      expect(req.user).toBeUndefined()
    })
  })

  describe('requireRole middleware', () => {
    it('allows user with matching role', () => {
      const req = {
        user: { id: userId, role: 'club_admin' },
      } as Request
      const res = {} as Response
      const next = vi.fn()

      requireRole('club_admin', 'super_admin')(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('rejects user with non-matching role with FORBIDDEN', () => {
      const req = {
        user: { id: userId, role: 'student' },
      } as Request
      const res = {} as Response
      const next = vi.fn()

      requireRole('club_admin', 'super_admin')(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(ApiError))
      const err = next.mock.calls[0][0] as ApiError
      expect(err.code).toBe('FORBIDDEN')
    })
  })
})
