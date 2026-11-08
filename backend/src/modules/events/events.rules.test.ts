import { describe, expect, it } from 'vitest'
import type { ApiError } from '../../lib/errors.js'
import {
  assertCanOpen,
  assertCapacity,
  assertEventShape,
  assertTransition,
  calcSeatsLeft,
  isPublicStatus,
} from './events.rules.js'

function codeOf(fn: () => void): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as ApiError).code
  }
  return undefined
}

describe('BR-E1 status machine', () => {
  it('allows draft -> open -> live -> ended', () => {
    expect(codeOf(() => assertTransition('draft', 'open'))).toBeUndefined()
    expect(codeOf(() => assertTransition('open', 'live'))).toBeUndefined()
    expect(codeOf(() => assertTransition('live', 'ended'))).toBeUndefined()
  })

  it('rejects backward moves, skips and repeats with CONFLICT', () => {
    expect(codeOf(() => assertTransition('open', 'draft'))).toBe('CONFLICT')
    expect(codeOf(() => assertTransition('live', 'open'))).toBe('CONFLICT')
    expect(codeOf(() => assertTransition('draft', 'live'))).toBe('CONFLICT')
    expect(codeOf(() => assertTransition('open', 'open'))).toBe('CONFLICT')
    expect(codeOf(() => assertTransition('ended', 'draft'))).toBe('CONFLICT')
  })
})

describe('BR-E2 paid events need a QR to open', () => {
  it('blocks paid without QR', () => {
    expect(codeOf(() => assertCanOpen({ isPaid: true, qrUrl: null }))).toBe('QR_REQUIRED')
  })
  it('allows paid with QR and free without QR', () => {
    expect(codeOf(() => assertCanOpen({ isPaid: true, qrUrl: 'https://x.test/qr.png' }))).toBeUndefined()
    expect(codeOf(() => assertCanOpen({ isPaid: false, qrUrl: null }))).toBeUndefined()
  })
})

describe('BR-E3 capacity', () => {
  it('rejects capacity below approved attendees', () => {
    expect(codeOf(() => assertCapacity(9, 10))).toBe('CAPACITY_BELOW_APPROVED')
  })
  it('allows capacity equal to or above approved', () => {
    expect(codeOf(() => assertCapacity(10, 10))).toBeUndefined()
    expect(codeOf(() => assertCapacity(50, 10))).toBeUndefined()
  })
})

describe('BR-E4 / BR-E5', () => {
  it('students never see drafts', () => {
    expect(isPublicStatus('draft')).toBe(false)
    expect(isPublicStatus('open')).toBe(true)
    expect(isPublicStatus('live')).toBe(true)
    expect(isPublicStatus('ended')).toBe(true)
  })
  it('seats_left = capacity - approved', () => {
    expect(calcSeatsLeft(100, 37)).toBe(63)
    expect(calcSeatsLeft(5, 5)).toBe(0)
  })
})

describe('event shape', () => {
  const start = new Date('2026-12-01T10:00:00Z')
  const end = new Date('2026-12-01T12:00:00Z')

  it('requires ends_at after starts_at', () => {
    expect(codeOf(() => assertEventShape({ startsAt: end, endsAt: start, isPaid: false, price: null }))).toBe('VALIDATION')
  })
  it('requires a price when paid and forbids one when free', () => {
    expect(codeOf(() => assertEventShape({ startsAt: start, endsAt: end, isPaid: true, price: null }))).toBe('VALIDATION')
    expect(codeOf(() => assertEventShape({ startsAt: start, endsAt: end, isPaid: false, price: 100 }))).toBe('VALIDATION')
    expect(codeOf(() => assertEventShape({ startsAt: start, endsAt: end, isPaid: true, price: 100 }))).toBeUndefined()
  })
})