/**
 * In-memory Prisma emulation for backend integration tests.
 * $transaction callbacks run serialized through a chain so overlapping HTTP
 * requests exercise the same code paths as a row-locking production database.
 */
import crypto from 'node:crypto'
import { vi } from 'vitest'
import bcrypt from 'bcryptjs'

export type DbUser = {
  id: string
  name: string
  email: string
  passwordHash: string
  role: 'student' | 'club_admin' | 'super_admin'
  rollNumber: string | null
  branch: string | null
  year: number | null
  createdAt: Date
}

export type DbEvent = {
  id: string
  clubId: string
  title: string
  description: string
  venue: string
  startsAt: Date
  endsAt: Date
  status: 'draft' | 'open' | 'live' | 'ended'
  club: { ownerId: string }
  settings: {
    capacity: number
    approvalMode: 'auto_until_full' | 'manual'
    isPaid: boolean
    price?: number
    qrUrl?: string
  } | null
}

export type DbRsvp = {
  id: string
  eventId: string
  userId: string
  answers: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected' | 'waitlist' | 'cancelled'
  createdAt: Date
}

export type DbPayment = {
  id: string
  rsvpId: string
  screenshotUrl: string
  status: 'pending' | 'verified' | 'rejected'
  rejectReason: string | null
}

export type DbReset = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

export type DbField = {
  id: string
  eventId: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox'
  required: boolean
  position: number
  options?: string[]
}

export interface Db {
  users: DbUser[]
  events: DbEvent[]
  rsvps: DbRsvp[]
  payments: DbPayment[]
  resets: DbReset[]
  fields: DbField[]
}

let db: Db = blankDb()
let tick = 0

const USER_PASSWORD_HASH = await bcrypt.hash('Password123!', 10)
export const USER_PLAIN_PASSWORD = 'Password123!'

function blankDb(): Db {
  return { users: [], events: [], rsvps: [], payments: [], resets: [], fields: [] }
}

function fakeId(prefix: string): string {
  tick += 1
  // Prefix must stay a hex char so the tests' UUID validation accepts fixture ids.
  return `${prefix}2468a1f-0000-0000-0000-${(tick >>> 0).toString().padStart(12, '0')}`
}

function nextTimestamp(): Date {
  tick += 1
  return new Date(1_700_000_000_000 + tick * 1000)
}

function asError(code: string): Error & { code: string } {
  const err = new Error(code) as Error & { code: string }
  err.code = code
  return err
}

const wrapEvent = (e: DbEvent) => ({ ...e, settings: e.settings ? { ...e.settings } : null, club: { ...e.club } })
const wrapRsvp = (r: DbRsvp, include?: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...r, answers: r.answers ?? null }
  if (include?.event) {
    const e = db.events.find((x) => x.id === r.eventId)
    out.event = e ? wrapEvent(e) : null
  }
  if (include?.payment) {
    out.payment = db.payments.find((p) => p.rsvpId === r.id) ?? null
  }
  return out
}

function matchesWhere(where: Record<string, unknown> | undefined, row: Record<string, unknown>): boolean {
  if (!where) return true
  for (const [key, value] of Object.entries(where)) {
    if (value == null) continue
    if (key.includes('_')) {
      const [a, b] = key.split('_')
      if (row[a] !== (value as Record<string, unknown>)[b]) return false
      continue
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cond = value as Record<string, unknown>
      if (cond.not !== undefined && row[key] === cond.not) return false
      if (cond.in !== undefined && !(cond.in as unknown[]).includes(row[key])) return false
      continue
    }
    if (row[key] !== value) return false
  }
  return true
}

interface SeedInput extends Partial<Db> {}

export const harness = {
  db: db as Db,
  reset(seed?: SeedInput): void {
    db = { ...blankDb(), ...(seed ?? {}) }
    tick = 0
    this.db = db
  },

  seedUser(over: Partial<DbUser> = {}): DbUser {
    const user: DbUser = {
      id: over.id ?? fakeId('b'),
      name: over.name ?? 'Test User',
      email: over.email ?? `user${this.db.users.length + 1}@test.edu`,
      passwordHash: over.passwordHash ?? USER_PASSWORD_HASH,
      role: over.role ?? 'student',
      rollNumber: over.rollNumber ?? null,
      branch: over.branch ?? null,
      year: over.year ?? null,
      createdAt: over.createdAt ?? nextTimestamp(),
    }
    this.db.users.push(user)
    return user
  },

  seedEvent(over: Partial<DbEvent> & { club: DbEvent['club'] }): DbEvent {
    const event: DbEvent = {
      id: over.id ?? fakeId('a'),
      clubId: over.clubId ?? fakeId('9'),
      title: over.title ?? 'Test Event',
      description: over.description ?? 'Seeded event',
      venue: over.venue ?? 'Hall 1',
      startsAt: over.startsAt ?? new Date(Date.now() + 86400000),
      endsAt: over.endsAt ?? new Date(Date.now() + 172800000),
      status: over.status ?? 'open',
      club: over.club,
      settings:
        over.settings ??
        ({ capacity: 5, approvalMode: 'auto_until_full', isPaid: false } as DbEvent['settings']),
    }
    this.db.events.push(event)
    return event
  },

  seedRsvp(over: Partial<DbRsvp> & { eventId: string; userId: string }): DbRsvp {
    const rsvp: DbRsvp = {
      id: over.id ?? fakeId('c'),
      eventId: over.eventId,
      userId: over.userId,
      answers: over.answers ?? null,
      status: over.status ?? 'pending',
      createdAt: over.createdAt ?? nextTimestamp(),
    }
    this.db.rsvps.push(rsvp)
    return rsvp
  },

  seedPayment(over: Partial<DbPayment> & { rsvpId: string }): DbPayment {
    const payment: DbPayment = {
      id: over.id ?? fakeId('d'),
      rsvpId: over.rsvpId,
      screenshotUrl: over.screenshotUrl ?? 'https://cloud.example.com/shot.png',
      status: over.status ?? 'pending',
      rejectReason: over.rejectReason ?? null,
    }
    this.db.payments.push(payment)
    return payment
  },

  seedReset(over: Partial<DbReset> & { userId: string }): DbReset {
    const reset: DbReset = {
      id: over.id ?? fakeId('e'),
      userId: over.userId,
      tokenHash: over.tokenHash ?? crypto.randomBytes(32).toString('hex'),
      expiresAt: over.expiresAt ?? new Date(Date.now() + 900000),
      usedAt: over.usedAt ?? null,
    }
    this.db.resets.push(reset)
    return reset
  },

  seedField(over: Partial<DbField> & { eventId: string }): DbField {
    const field: DbField = {
      id: over.id ?? fakeId('f'),
      eventId: over.eventId,
      label: over.label ?? 'Question',
      type: over.type ?? 'text',
      required: over.required ?? false,
      position: over.position ?? db.fields.length,
      ...(over.options !== undefined ? { options: over.options } : {}),
    }
    this.db.fields.push(field)
    return field
  },

  mock: {
    $connect: vi.fn(async () => undefined),
    $disconnect: vi.fn(async () => undefined),
    $queryRaw: vi.fn(async () => [] as unknown[]),

    user: {
      create: vi.fn(async (args?: any) => {
        if (db.users.some((u) => u.email === args.data.email)) {
          throw asError('P2002')
        }
        const row: DbUser = {
          id: fakeId('b'),
          rollNumber: null,
          branch: null,
          year: null,
          createdAt: nextTimestamp(),
          ...args.data,
        }
        if (!(row.createdAt instanceof Date)) row.createdAt = nextTimestamp()
        db.users.push(row)
        return { ...row }
      }),
      findUnique: vi.fn(async (args?: any) => {
        const w = args.where
        const hit = db.users.find(
          (u) =>
            (w.id !== undefined && u.id === w.id) || (w.email !== undefined && u.email === w.email),
        )
        return hit ? { ...hit } : null
      }),
      update: vi.fn(async (args?: any) => {
        const hit = db.users.find((u) => u.id === args.where.id)
        if (!hit) throw asError('P2025')
        Object.assign(hit, args.data)
        return { ...hit }
      }),
      count: vi.fn(async () => db.users.length),
    },

    event: {
      findUnique: vi.fn(async (args?: any) => {
        const hit = db.events.find((e) => e.id === args.where.id)
        if (!hit) return null
        const out = wrapEvent(hit) as Record<string, unknown>
        if (args.include?.rsvpFormFields) {
          out.rsvpFormFields = db.fields
            .filter((f) => f.eventId === hit.id)
            .sort((a, b) => a.position - b.position)
            .map((f) => ({ ...f }))
        }
        return out
      }),
      count: vi.fn(async () => db.events.length),
    },

    rsvp: {
      findUnique: vi.fn(async (args?: any) => {
        const w = args.where
        const hit = db.rsvps.find((r) => {
          if (w.id !== undefined) return r.id === w.id
          if (w.eventId_userId)
            return (
              r.eventId === w.eventId_userId.eventId && r.userId === w.eventId_userId.userId
            )
          return false
        })
        return hit ? wrapRsvp(hit, args.include) : null
      }),
      findMany: vi.fn(async (args?: any) => {
        let hits = db.rsvps.filter((r) => matchesWhere(args.where, r as any))
        const order = args.orderBy?.createdAt
        if (order === 'asc') hits = [...hits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        if (order === 'desc') hits = [...hits].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args.take !== undefined) hits = hits.slice(0, args.take as number)
        return hits.map((r) => wrapRsvp(r, args.include))
      }),
      count: vi.fn(async (args?: any) => db.rsvps.filter((r) => matchesWhere(args.where, r as any)).length),
      create: vi.fn(async (args?: any) => {
        if (
          db.rsvps.some((r) => r.eventId === args.data.eventId && r.userId === args.data.userId)
        ) {
          throw asError('P2002')
        }
        const row: DbRsvp = {
          id: args.data.id ?? fakeId('c'),
          answers: args.data.answers ?? null,
          status: args.data.status ?? 'pending',
          createdAt: nextTimestamp(),
          eventId: args.data.eventId,
          userId: args.data.userId,
        }
        rsvpDefaults(args.data, row)
        db.rsvps.push(row)
        return wrapRsvp(row)
      }),
      update: vi.fn(async (args?: any) => {
        const hit = db.rsvps.find((r) => r.id === args.where.id)
        if (!hit) throw asError('P2025')
        Object.assign(hit, args.data)
        return wrapRsvp(hit, args.include)
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },

    payment: {
      findUnique: vi.fn(async (args?: any) => {
        const hit = db.payments.find((p) => p.rsvpId === args.where.rsvpId)
        if (!hit) return null
        const out: Record<string, unknown> = { ...hit }
        if (args.include?.rsvp) {
          const rsvpRow = db.rsvps.find((r) => r.id === hit.rsvpId)
          const nestedRsvp: Record<string, unknown> = rsvpRow ? { ...rsvpRow } : null
          if (nestedRsvp && args.include.rsvp.include?.event) {
            const evt = db.events.find((e) => e.id === rsvpRow!.eventId)
            const nestedEvent: Record<string, unknown> = evt ? wrapEvent(evt) : null
            if (nestedEvent && args.include.rsvp.include.event.include?.club) {
              nestedEvent.club = { ...(evt!.club) }
            }
            nestedRsvp.event = nestedEvent
          }
          out.rsvp = nestedRsvp
        }
        return out
      }),
      create: vi.fn(async (args?: any) => {
        const row: DbPayment = {
          id: fakeId('d'),
          status: 'pending',
          rejectReason: null,
          screenshotUrl: '',
          ...args.data,
        }
        db.payments.push(row)
        return { ...row }
      }),
      update: vi.fn(async (args?: any) => {
        const hit = db.payments.find((p) => p.rsvpId === args.where.rsvpId)
        if (!hit) throw asError('P2025')
        Object.assign(hit, args.data)
        return { ...hit }
      }),
      upsert: vi.fn(async (args?: any) => {
        let hit = db.payments.find((p) => p.rsvpId === args.where.rsvpId)
        if (hit) {
          Object.assign(hit, args.update)
          return { ...hit }
        }
        hit = { id: fakeId('d'), status: 'pending', rejectReason: null, screenshotUrl: '', ...args.create }
        db.payments.push(hit)
        return { ...hit }
      }),
    },

    passwordReset: {
      create: vi.fn(async (args?: any) => {
        const row: DbReset = { id: fakeId('e'), usedAt: null, ...args.data }
        db.resets.push(row)
        return { ...row }
      }),
      findFirst: vi.fn(async (args?: any) => {
        const hit = db.resets.find((r) => matchesWhere(args.where, r as any))
        return hit ? { ...hit } : null
      }),
      findUnique: vi.fn(async (args?: any) => {
        const hit = db.resets.find((r) => matchesWhere(args.where, r as any))
        return hit ? { ...hit } : null
      }),
      update: vi.fn(async (args?: any) => {
        const hit = db.resets.find((r) => r.id === args.where.id)
        if (!hit) throw asError('P2025')
        Object.assign(hit, args.data)
        return { ...hit }
      }),
    },

    $transaction: vi.fn((arg?: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[])
      const work = arg as (tx: unknown) => Promise<unknown> & void
      const run = cursor.then(() => Promise.resolve().then(() => work(txCtx)))
      cursor = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    }),
  } satisfies Record<string, unknown>,
}

function rsvpDefaults(argsData: Record<string, unknown>, row: DbRsvp): void {
  if (argsData.status !== undefined) row.status = argsData.status as DbRsvp['status']
  if (argsData.answers !== undefined) row.answers = (argsData.answers ?? null) as DbRsvp['answers']
  if (argsData.createdAt !== undefined) row.createdAt = argsData.createdAt as Date
}

// Serialized chain for $transaction callbacks: overlapping requests execute one
// transaction at a time, mirroring a real database's row-lock behavior.
let cursor: Promise<unknown> = Promise.resolve()

// Transactions execute against the same mocked client instance (same pattern as
// the existing attendee-ops test mocks).
const txCtx = harness.mock as unknown as Record<string, unknown> & { $queryRaw: unknown }
