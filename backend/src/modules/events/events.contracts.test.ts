import { describe, expect, it } from 'vitest'
import {
  changeStatusBody,
  createEventBody,
  listEventsQuery,
  updateEventBody,
} from './events.contracts.js'

const validCreate = {
  title: 'Intro to Docker',
  description: 'Hands-on workshop',
  venue: 'Seminar Hall',
  starts_at: '2026-12-01T10:00:00Z',
  ends_at: '2026-12-01T12:00:00Z',
  capacity: 80,
}

describe('createEventBody', () => {
  it('applies defaults', () => {
    const parsed = createEventBody.parse(validCreate)
    expect(parsed.approval_mode).toBe('auto_until_full')
    expect(parsed.is_paid).toBe(false)
  })
  it('rejects bad capacity, dates and urls', () => {
    expect(createEventBody.safeParse({ ...validCreate, capacity: 0 }).success).toBe(false)
    expect(createEventBody.safeParse({ ...validCreate, starts_at: 'tomorrow' }).success).toBe(false)
    expect(createEventBody.safeParse({ ...validCreate, qr_url: 'not a url' }).success).toBe(false)
  })
  it('rejects prices with more than 2 decimals', () => {
    expect(createEventBody.safeParse({ ...validCreate, is_paid: true, price: 10.999 }).success).toBe(false)
    expect(createEventBody.safeParse({ ...validCreate, is_paid: true, price: 99.5 }).success).toBe(true)
  })
})

describe('updateEventBody', () => {
  it('requires at least one field', () => {
    expect(updateEventBody.safeParse({}).success).toBe(false)
    expect(updateEventBody.safeParse({ capacity: 10 }).success).toBe(true)
  })
})

describe('listEventsQuery', () => {
  it('coerces pagination and the paid flag', () => {
    const parsed = listEventsQuery.parse({ page: '2', limit: '10', paid: 'true' })
    expect(parsed).toMatchObject({ page: 2, limit: 10, paid: true })
  })
  it('defaults page and limit, caps limit at 50', () => {
    expect(listEventsQuery.parse({})).toMatchObject({ page: 1, limit: 20 })
    expect(listEventsQuery.safeParse({ limit: '500' }).success).toBe(false)
  })
  it('rejects from after to', () => {
    expect(
      listEventsQuery.safeParse({ from: '2026-12-02T00:00:00Z', to: '2026-12-01T00:00:00Z' }).success,
    ).toBe(false)
  })
})

describe('changeStatusBody', () => {
  it('only accepts known statuses', () => {
    expect(changeStatusBody.safeParse({ status: 'open' }).success).toBe(true)
    expect(changeStatusBody.safeParse({ status: 'cancelled' }).success).toBe(false)
  })
})