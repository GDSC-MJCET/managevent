import { prisma } from '../../db/index.js'
import { ApiError } from '../../lib/errors.js'
import type {
  AssignCertificateBody,
  CertificateAssignmentItem,
} from './certificates.schema.js'

export interface SerializedCertificate {
  id: string
  event_id: string
  user_id: string
  file_url: string
  issued_at: string
  event?: {
    id: string
    title: string
    banner_url: string | null
    venue: string
    starts_at: string
    ends_at: string
  }
  user?: {
    id: string
    name: string
    email: string
    roll_number: string | null
  }
}

export class CertificateService {
  /**
   * AD-02: Assign certificate(s) to attendee(s).
   * Enforces:
   * 1. Event exists
   * 2. Caller is the event's club owner
   * 3. Attendee has an approved RSVP or check-in record
   * 4. Enforces (eventId, userId) uniqueness
   */
  async assignCertificates(
    eventId: string,
    callerId: string,
    data: AssignCertificateBody,
  ): Promise<{
    certificate?: SerializedCertificate
    certificates?: SerializedCertificate[]
  }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { club: true },
    })

    if (!event) {
      throw new ApiError('NOT_FOUND', 'Event not found')
    }

    if (event.club.ownerId !== callerId) {
      throw new ApiError(
        'FORBIDDEN',
        'Only the event club owner can assign certificates',
      )
    }

    const items: CertificateAssignmentItem[] = data.assignments ?? [
      { user_id: data.user_id!, file_url: data.file_url! },
    ]

    // Verify eligibility and uniqueness for all candidates
    for (const item of items) {
      // Eligibility check per README §7 AD-02: "Assign only to approved or checked-in users"
      const rsvp = await prisma.rsvp.findUnique({
        where: {
          eventId_userId: { eventId, userId: item.user_id },
        },
        include: { checkin: true },
      })

      const isEligible =
        rsvp && (rsvp.status === 'approved' || Boolean(rsvp.checkin))

      if (!isEligible) {
        throw new ApiError(
          'NOT_APPROVED',
          `Attendee ${item.user_id} is not an approved or checked-in participant for this event`,
        )
      }

      // Check unique constraint @@unique([eventId, userId])
      const existing = await prisma.certificate.findUnique({
        where: {
          eventId_userId: { eventId, userId: item.user_id },
        },
      })

      if (existing) {
        throw new ApiError(
          'CONFLICT',
          `Certificate has already been assigned to user ${item.user_id} for this event`,
        )
      }
    }

    // Atomic issuance in transaction with concurrency protection
    let createdCerts
    try {
      createdCerts = await prisma.$transaction(
        items.map((item) =>
          prisma.certificate.create({
            data: {
              eventId,
              userId: item.user_id,
              fileUrl: item.file_url,
            },
          }),
        ),
      )
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ApiError(
          'CONFLICT',
          'Certificate has already been assigned to one or more selected users',
        )
      }
      throw err
    }

    const formatted = createdCerts.map((c) => ({
      id: c.id,
      event_id: c.eventId,
      user_id: c.userId,
      file_url: c.fileUrl,
      issued_at: c.issuedAt.toISOString(),
    }))

    if (data.assignments && data.assignments.length > 0) {
      return { certificates: formatted }
    }

    return { certificate: formatted[0] }
  }

  /**
   * AD-02 / BR-P4: Get certificates belonging to the authenticated student.
   * "A user downloads only their own certificate."
   */
  async getStudentCertificates(
    studentId: string,
  ): Promise<{ certificates: SerializedCertificate[] }> {
    const certs = await prisma.certificate.findMany({
      where: { userId: studentId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            bannerUrl: true,
            venue: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    })

    return {
      certificates: certs.map((c) => ({
        id: c.id,
        event_id: c.eventId,
        user_id: c.userId,
        file_url: c.fileUrl,
        issued_at: c.issuedAt.toISOString(),
        event: {
          id: c.event.id,
          title: c.event.title,
          banner_url: c.event.bannerUrl,
          venue: c.event.venue,
          starts_at: c.event.startsAt.toISOString(),
          ends_at: c.event.endsAt.toISOString(),
        },
      })),
    }
  }

  /**
   * AD-02: Get all certificates issued for an event (Club Admin View).
   * Verifies that the caller owns the club associated with the event.
   */
  async getEventCertificates(
    eventId: string,
    callerId: string,
  ): Promise<{
    event_id: string
    count: number
    certificates: SerializedCertificate[]
  }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { club: true },
    })

    if (!event) {
      throw new ApiError('NOT_FOUND', 'Event not found')
    }

    if (event.club.ownerId !== callerId) {
      throw new ApiError(
        'FORBIDDEN',
        'Only the event club owner can view event certificates',
      )
    }

    const certs = await prisma.certificate.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            rollNumber: true,
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    })

    return {
      event_id: eventId,
      count: certs.length,
      certificates: certs.map((c) => ({
        id: c.id,
        event_id: c.eventId,
        user_id: c.userId,
        file_url: c.fileUrl,
        issued_at: c.issuedAt.toISOString(),
        user: {
          id: c.user.id,
          name: c.user.name,
          email: c.user.email,
          roll_number: c.user.rollNumber,
        },
      })),
    }
  }
}

export const certificateService = new CertificateService()
