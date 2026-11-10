/**
 * AL-02: Demo seed
 * 1 super_admin, 3 approved demo clubs, 2 events, 5 students.
 * Run: npm run db:seed   (clean on an empty database)
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const days = 7 * 24 * 60 * 60 * 1000

function uuid(n: string): string {
  return `00000002-0000-0000-0000-${n.padStart(12, '0')}`
}

async function main(): Promise<void> {
  const existing = await prisma.user.count()
  if (existing > 0) {
    console.log(`Seed skipped: database already has ${existing} users.`)
    return
  }

  const passwordHash = await bcrypt.hash('Password123!', 10)

  // ── super_admin ──
  const superAdminId = uuid('000000000001')
  await prisma.user.create({
    data: {
      id: superAdminId,
      name: 'MJCET Admin',
      email: 'admin@mjcet.edu.in',
      passwordHash,
      role: 'super_admin',
    },
  })

  // ── 3 approved demo clubs (each owned by a club_admin) ──
  const clubOwners = [
    { id: uuid('000000000002'), name: 'Zaina Khan', email: 'coding@mjcet.edu.in', club: 'Coding Club', desc: 'Programming community at MJCET — contests, hackathons and study circles.' },
    { id: uuid('000000000003'), name: 'Omar Farooq', email: 'robotics@mjcet.edu.in', club: 'Robotics Club', desc: 'Building robots, drones and embedded systems at MJCET.' },
    { id: uuid('000000000004'), name: 'Sara Ahmed', email: 'ecell@mjcet.edu.in', club: 'E-Cell', desc: 'Entrepreneurship cell — pitch nights, bootcamps and startup fairs.' },
  ]

  const clubs = [] as { id: string }[]
  for (const owner of clubOwners) {
    const ownerId = owner.id
    await prisma.user.create({
      data: {
        id: ownerId,
        name: owner.name,
        email: owner.email,
        passwordHash,
        role: 'club_admin',
      },
    })
    const club = await prisma.club.create({
      data: {
        ownerId,
        name: owner.club,
        description: owner.desc,
        facultyAdvisor: 'Dr. Demo Advisor',
        contactEmail: owner.email,
        status: 'approved',
        socials: { instagram: '@mjcet.demo' },
      },
    })
    clubs.push(club)
  }

  // ── 2 demo events ──
  const now = Date.now()
  await prisma.event.create({
    data: {
      id: uuid('000000000101'),
      clubId: clubs[0]!.id,
      title: 'Intro to Git & Open Source',
      description: 'Hands-on session: branches, PRs and your first open-source contribution.',
      venue: 'Seminar Hall 2',
      startsAt: new Date(now + 14 * days),
      endsAt: new Date(now + 16 * days),
      status: 'open',
      settings: {
        create: {
          capacity: 50,
          approvalMode: 'auto_until_full',
          isPaid: false,
        },
      },
    },
  })

  await prisma.event.create({
    data: {
      id: uuid('000000000102'),
      clubId: clubs[1]!.id,
      title: 'RoboWars Workshop',
      description: 'Paid workshop: build and drive a combat robot with a club mentor.',
      venue: 'Robotics Lab',
      startsAt: new Date(now + 21 * days),
      endsAt: new Date(now + 23 * days),
      status: 'open',
      settings: {
        create: {
          capacity: 30,
          approvalMode: 'manual',
          isPaid: true,
          price: 150,
          qrUrl: 'https://res.cloudinary.com/demo/image/upload/robowars-qr.png',
        },
      },
    },
  })

  // ── 5 demo students ──
  const students = [
    { id: uuid('000000000201'), name: 'Areeba Siddiqui', email: 'areeba.student@mjcet.edu.in' },
    { id: uuid('000000000202'), name: 'Rayan Ali', email: 'rayan.student@mjcet.edu.in' },
    { id: uuid('000000000203'), name: 'Huda Fatima', email: 'huda.student@mjcet.edu.in' },
    { id: uuid('000000000204'), name: 'Talha Osman', email: 'talha.student@mjcet.edu.in' },
    { id: uuid('000000000205'), name: 'Ibrahim Noor', email: 'ibrahim.student@mjcet.edu.in' },
  ]
  let roll = 16011
  for (const student of students) {
    await prisma.user.create({
      data: {
        id: student.id,
        name: student.name,
        email: student.email,
        passwordHash,
        role: 'student',
        rollNumber: (roll++).toString(),
        branch: 'CSE',
        year: 2,
      },
    })
  }

  console.log('Seed complete: 1 super_admin, 3 approved clubs, 2 events, 5 students (all demo passwords: Password123!)')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Seed failed:', err)
    await prisma.$disconnect()
    process.exit(1)
  })
