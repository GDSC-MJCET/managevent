export function sanitizeAndEscapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return ''
  }

  let str = typeof val === 'object' ? JSON.stringify(val) : String(val)

  // Mitigate formula injection risk in spreadsheet software (=, +, -, @)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }

  // RFC 4180 escaping: wrap in quotes and escape internal quotes if special characters present
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`
  }

  return str
}

export function generateAttendeesCsv(
  attendees: Array<{
    id: string
    user: {
      name: string
      email: string
      rollNumber?: string | null
      branch?: string | null
      year?: number | null
    }
    status: string
    createdAt: Date | string
    answers?: unknown
  }>,
): string {
  const headers = [
    'RSVP ID',
    'Name',
    'Email',
    'Roll Number',
    'Branch',
    'Year',
    'Status',
    'Created At',
    'Answers',
  ]

  const rows = attendees.map((a) => [
    a.id,
    a.user.name,
    a.user.email,
    a.user.rollNumber ?? '',
    a.user.branch ?? '',
    a.user.year ?? '',
    a.status,
    typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString(),
    a.answers ? JSON.stringify(a.answers) : '',
  ])

  const csvLines = [
    headers.map(sanitizeAndEscapeCsvField).join(','),
    ...rows.map((row) => row.map(sanitizeAndEscapeCsvField).join(',')),
  ]

  return csvLines.join('\r\n')
}
