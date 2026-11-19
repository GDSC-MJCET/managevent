import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import type {
  CreateGalleryItemInput,
  UpdateGalleryItemInput,
} from './schema.js'

export interface SerializedGalleryItem {
  id: string
  event_id: string
  file_url: string
  caption: string | null
  position: number
}

export class GalleryService {
  /**
   * Bulk add gallery items to an event.
   * Requires: event exists, event is 'ended' (BR-P1), caller is club owner.
   */
  async bulkCreateGallery(
    eventId: string,
    userId: string,
    items: CreateGalleryItemInput[],
  ): Promise<{ items: SerializedGalleryItem[] }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { club: true },
    })

    if (!event) {
      throw new ApiError('NOT_FOUND', 'Event not found')
    }

    if (event.status !== 'ended') {
      throw new ApiError(
        'RECAP_LOCKED',
        'Recap is locked until the event has ended',
      )
    }

    if (event.club.ownerId !== userId) {
      throw new ApiError(
        'FORBIDDEN',
        'Only the event club owner can modify the gallery',
      )
    }

    // Atomic creation inside transaction
    const created = await prisma.$transaction(
      items.map((item) =>
        prisma.galleryItem.create({
          data: {
            eventId,
            fileUrl: item.file_url,
            caption: item.caption ?? null,
            position: item.position,
          },
        }),
      ),
    )

    return {
      items: created.map((item) => ({
        id: item.id,
        event_id: item.eventId,
        file_url: item.fileUrl,
        caption: item.caption,
        position: item.position,
      })),
    }
  }

  /**
   * Update captions and positions of gallery items.
   * Requires: event exists, event is 'ended' (BR-P1), caller is club owner,
   * all items belong to this event.
   */
  async updateGallery(
    eventId: string,
    userId: string,
    items: UpdateGalleryItemInput[],
  ): Promise<{ updated: number; items: SerializedGalleryItem[] }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { club: true },
    })

    if (!event) {
      throw new ApiError('NOT_FOUND', 'Event not found')
    }

    if (event.status !== 'ended') {
      throw new ApiError(
        'RECAP_LOCKED',
        'Recap is locked until the event has ended',
      )
    }

    if (event.club.ownerId !== userId) {
      throw new ApiError(
        'FORBIDDEN',
        'Only the event club owner can modify the gallery',
      )
    }

    // Verify all requested items exist and belong to this event
    const itemIds = items.map((i) => i.id)
    const existing = await prisma.galleryItem.findMany({
      where: {
        id: { in: itemIds },
        eventId,
      },
    })

    if (existing.length !== items.length) {
      throw new ApiError(
        'NOT_FOUND',
        'One or more gallery items were not found for this event',
      )
    }

    // Atomic update inside transaction
    const updated = await prisma.$transaction(
      items.map((item) => {
        const data: { caption?: string | null; position?: number } = {}
        if (item.caption !== undefined) {
          data.caption = item.caption
        }
        if (item.position !== undefined) {
          data.position = item.position
        }
        return prisma.galleryItem.update({
          where: { id: item.id },
          data,
        })
      }),
    )

    return {
      updated: updated.length,
      items: updated.map((item) => ({
        id: item.id,
        event_id: item.eventId,
        file_url: item.fileUrl,
        caption: item.caption,
        position: item.position,
      })),
    }
  }

  /**
   * Delete a single gallery item.
   * Requires: item exists, associated event is 'ended' (BR-P1), caller is club owner.
   */
  async deleteGalleryItem(
    galleryItemId: string,
    userId: string,
  ): Promise<{ deleted: true; id: string }> {
    const item = await prisma.galleryItem.findUnique({
      where: { id: galleryItemId },
      include: {
        event: {
          include: {
            club: true,
          },
        },
      },
    })

    if (!item) {
      throw new ApiError('NOT_FOUND', 'Gallery item not found')
    }

    if (item.event.status !== 'ended') {
      throw new ApiError(
        'RECAP_LOCKED',
        'Recap is locked until the event has ended',
      )
    }

    if (item.event.club.ownerId !== userId) {
      throw new ApiError(
        'FORBIDDEN',
        'Only the event club owner can delete this gallery item',
      )
    }

    await prisma.galleryItem.delete({
      where: { id: galleryItemId },
    })

    return {
      deleted: true,
      id: galleryItemId,
    }
  }
}

export const galleryService = new GalleryService()
