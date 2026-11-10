/**
 * Validates student RSVP answers against Anas's AN-01 `rsvp_form_fields`
 * contract: `{ label, type: text|textarea|number|select|checkbox, required,
 * options?: string[] }` (AL-07: Ali's RSVP submission reads Anas's saved
 * questions and enforces required fields).
 *
 * Returns a human-readable message when invalid, `null` when the answers pass.
 * Extra answer keys (profile details collected client-side) are allowed.
 */
interface RsvpFormFieldLike {
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox'
  required: boolean
  options?: unknown
}

function asStringOptions(options: unknown): string[] | null {
  if (!Array.isArray(options)) return null
  if (options.length < 2) return null
  return options.filter((o): o is string => typeof o === 'string')
}

export function validateAnswers(
  fields: RsvpFormFieldLike[],
  answers: Record<string, unknown>,
): string | null {
  for (const field of fields) {
    const raw = answers[field.label]

    const isEmpty =
      raw == null ||
      (typeof raw === 'string' && raw.trim() === '') ||
      (Array.isArray(raw) && raw.length === 0)

    if (isEmpty) {
      if (field.required) {
        return `${field.label} is required`
      }
      continue
    }

    switch (field.type) {
      case 'text':
      case 'textarea': {
        if (typeof raw !== 'string') {
          return `${field.label} must be text`
        }
        break
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(n)) {
          return `${field.label} must be a number`
        }
        break
      }
      case 'select': {
        const options = asStringOptions(field.options)
        if (typeof raw !== 'string') {
          return `${field.label} must be one of the available options`
        }
        if (options && !options.includes(raw)) {
          return `${field.label} must be one of the available options`
        }
        break
      }
      case 'checkbox': {
        const options = asStringOptions(field.options)
        const values = Array.isArray(raw) ? raw : [raw]
        if (values.some((v) => typeof v !== 'string')) {
          return `${field.label} accepts checkbox selections only`
        }
        if (options && values.some((v) => !options.includes(v as string))) {
          return `${field.label} contains an option that is not offered`
        }
        break
      }
    }
  }

  return null
}
