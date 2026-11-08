import { describe, expect, it } from 'vitest'
import { createDoubtBody, listDoubtsQuery, moderateDoubtBody } from './doubts.contracts.js'
import { decideDoubtAccess } from './doubts.rules.js'

describe('BR-L1 doubts access', () => {
  it('the club owner is always allowed, in any status', () => {
    for (const eventStatus of ['draft', 'open', 'live', 'ended'] as const) {
      expect(decideDoubtAccess({ isOwner: true, eventStatus, isApproved: false })).toEqual({ allowed: true })
    }
  })

  it('approved attendees are allowed only while the event is live', () => {
    expect(decideDoubtAccess({ isOwner: false, eventStatus: 'live', isApproved: true })).toEqual({ allowed: true })
    expect(decideDoubtAccess({ isOwner: false, eventStatus: 'open', isApproved: true })).toMatchObject({ code: 'EVENT_NOT_OPEN' })
    expect(decideDoubtAccess({ isOwner: false, eventStatus: 'ended', isApproved: true })).toMatchObject({ code: 'EVENT_NOT_OPEN' })
  })

  it('users without an approved RSVP get NOT_APPROVED', () => {
    expect(decideDoubtAccess({ isOwner: false, eventStatus: 'live', isApproved: false })).toMatchObject({ code: 'NOT_APPROVED' })
  })

  it('drafts are hidden from non-owners (BR-E4)', () => {
    expect(decideDoubtAccess({ isOwner: false, eventStatus: 'draft', isApproved: true })).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('doubt contracts', () => {
  it('createDoubtBody trims and enforces length', () => {
    expect(createDoubtBody.parse({ text: '  What is Docker?  ' }).text).toBe('What is Docker?')
    expect(createDoubtBody.safeParse({ text: 'hi' }).success).toBe(false)
    expect(createDoubtBody.safeParse({ text: 'x'.repeat(501) }).success).toBe(false)
  })

  it('moderateDoubtBody needs an answer or a pinned flag', () => {
    expect(moderateDoubtBody.safeParse({}).success).toBe(false)
    expect(moderateDoubtBody.safeParse({ answer: '   ' }).success).toBe(false)
    expect(moderateDoubtBody.safeParse({ answer: 'Use a volume.' }).success).toBe(true)
    expect(moderateDoubtBody.safeParse({ pinned: false }).success).toBe(true)
  })

  it('listDoubtsQuery defaults and caps the limit', () => {
    expect(listDoubtsQuery.parse({})).toEqual({ page: 1, limit: 50 })
    expect(listDoubtsQuery.safeParse({ limit: '101' }).success).toBe(false)
  })
})