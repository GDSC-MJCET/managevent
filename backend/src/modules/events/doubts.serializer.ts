import type { Prisma } from '@prisma/client'
import type { DoubtBroadcast, DoubtView } from './doubts.contracts.js'

export const doubtInclude = {
  user: { select: { id: true, name: true } },
  _count: { select: { votes: true } },
} satisfies Prisma.DoubtInclude

export type DoubtWithRelations = Prisma.DoubtGetPayload<{ include: typeof doubtInclude }>

export function toBroadcast(doubt: DoubtWithRelations): DoubtBroadcast {
  return {
    id: doubt.id,
    event_id: doubt.eventId,
    text: doubt.text,
    status: doubt.status,
    answer: doubt.answer,
    pinned: doubt.pinned,
    votes: doubt._count.votes,
    created_at: doubt.createdAt.toISOString(),
  }
}

export function toView(
  doubt: DoubtWithRelations,
  viewer: { isOwner: boolean; userId: string | null; hasVoted: boolean },
): DoubtView {
  return {
    ...toBroadcast(doubt),
    has_voted: viewer.hasVoted,
    is_mine: viewer.userId !== null && doubt.userId === viewer.userId,
    author_name: viewer.isOwner ? doubt.user.name : null,
  }
}