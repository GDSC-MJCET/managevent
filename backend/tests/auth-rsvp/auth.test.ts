import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { harness } from '../helpers/prismaHarness.js'
import { hashToken } from '../../src/modules/auth-rsvp/services/jwt.js'

vi.mock('../../src/db/index.js', () => ({
  prisma: harness.mock,
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

const { app } = await import('../../src/app.js')

describe('AL-03: Auth endpoints', () => {
  beforeEach(() => {
    harness.reset()
  })

  describe('POST /api/auth/signup', () => {
    it('creates a student account and returns a verifiable token', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Nova Student', email: 'nova@mjcet.edu.in', password: 'StrongPass!1' })

      expect(res.status).toBe(201)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.user.role).toBe('student')
      expect(res.body.data.token).toBeTruthy()

      // AL-03: JWT verifies against /me
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.data.token}`)
      expect(me.status).toBe(200)
      expect(me.body.data.user.email).toBe('nova@mjcet.edu.in')
    })

    it('never creates super_admin even if the client sends a role', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Escalator',
          email: 'escalate@mjcet.edu.in',
          password: 'StrongPass!1',
          role: 'super_admin',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.user.role).toBe('student')
    })

    it('returns CONFLICT on duplicate email', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ name: 'First', email: 'dup@mjcet.edu.in', password: 'StrongPass!1' })

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Second', email: 'dup@mjcet.edu.in', password: 'StrongPass!1' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('rejects short passwords and bad emails with VALIDATION', async () => {
      const short = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'X', email: 'x@mjcet.edu.in', password: 'short' })
      expect(short.status).toBe(400)
      expect(short.body.error.code).toBe('VALIDATION')

      const badEmail = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'X', email: 'not-an-email', password: 'StrongPass!1' })
      expect(badEmail.status).toBe(400)
      expect(badEmail.body.error.code).toBe('VALIDATION')
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Login User', email: 'login@mjcet.edu.in', password: 'StrongPass!1' })
    })

    it('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@mjcet.edu.in', password: 'StrongPass!1' })
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.data.token).toBeTruthy()
    })

    it('returns UNAUTHENTICATED for a wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@mjcet.edu.in', password: 'WrongPassword99' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns UNAUTHENTICATED for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@mjcet.edu.in', password: 'StrongPass!1' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/auth/me')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })
  })
})

describe('AL-06: Profile and password', () => {
  let token: string

  beforeEach(async () => {
    harness.reset()
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Profile User', email: 'profile@mjcet.edu.in', password: 'StrongPass!1' })
    token = res.body.data.token
  })

  describe('PATCH /api/auth/me', () => {
    it('updates rollNumber, branch and year', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ rollNumber: '1602-CS-01', branch: 'CSE', year: 3 })

      expect(res.status).toBe(200)
      expect(res.body.data.user).toMatchObject({
        rollNumber: '1602-CS-01',
        branch: 'CSE',
        year: 3,
      })

      // AL-09 acceptance: profile is asked once before the first RSVP
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
      expect(me.body.data.user.rollNumber).toBe('1602-CS-01')
    })

    it('rejects an empty patch body', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION')
    })

    it('rejects invalid year values', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ year: 9 })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/auth/password', () => {
    it('rejects a wrong current password', async () => {
      const res = await request(app)
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'Nope1234!', newPassword: 'AnotherPass!2' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('rotates the password and the new one logs in', async () => {
      const res = await request(app)
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'StrongPass!1', newPassword: 'FreshPass!3' })
      expect(res.status).toBe(200)

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profile@mjcet.edu.in', password: 'FreshPass!3' })
      expect(login.status).toBe(200)

      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profile@mjcet.edu.in', password: 'StrongPass!1' })
      expect(oldLogin.status).toBe(401)
    })
  })

  describe('POST /api/auth/forgot + /api/auth/reset', () => {
    it('responds identically for unknown emails', async () => {
      const res = await request(app)
        .post('/api/auth/forgot')
        .send({ email: 'nobody@mjcet.edu.in' })
      expect(res.status).toBe(200)
      expect(res.body.data.resetToken).toBeUndefined()
    })

    it('issues a token, resets, and enforces single use', async () => {
      const forgot = await request(app)
        .post('/api/auth/forgot')
        .send({ email: 'profile@mjcet.edu.in' })
      expect(forgot.status).toBe(200)

      const usedToken = forgot.body.data.resetToken
      expect(usedToken).toBeTruthy()

      const reset = await request(app)
        .post('/api/auth/reset')
        .send({ token: usedToken, newPassword: 'ResetPass!4' })
      expect(reset.status).toBe(200)

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profile@mjcet.edu.in', password: 'ResetPass!4' })
      expect(login.status).toBe(200)

      // single use
      const reuse = await request(app)
        .post('/api/auth/reset')
        .send({ token: usedToken, newPassword: 'AgainPass!5' })
      expect(reuse.status).toBe(401)
      expect(reuse.body.error.code).toBe('UNAUTHENTICATED')

      // unknown token
      const bogus = await request(app)
        .post('/api/auth/reset')
        .send({ token: 'who-would-modify-this-token', newPassword: 'AgainPass!5' })
      expect(bogus.status).toBe(401)
    })

    it('rejects an expired reset token', async () => {
      harness.db.resets.push({
        id: 'expired-reset-1',
        userId: harness.db.users[0]!.id,
        tokenHash: hashToken('a'.repeat(40)),
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      })

      const expired = await request(app)
        .post('/api/auth/reset')
        .send({ token: 'a'.repeat(40), newPassword: 'ResetPass!4' })
      expect(expired.status).toBe(401)
    })
  })
})
