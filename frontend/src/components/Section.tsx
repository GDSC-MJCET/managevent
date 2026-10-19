import type { ReactNode } from 'react'

type SectionProps = {
  id: string
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Section({ id, title, description, children, className = '' }: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-20 ${className}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
      </div>
      {description ? (
        <p className="mb-5 max-w-3xl text-sm leading-6 text-ink/60">{description}</p>
      ) : null}
      {children}
    </section>
  )
}

export function ScrollTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-fog-dark bg-white shadow-sm">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  )
}

export function TableHead({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-fog-dark bg-fog/60">
        {columns.map((column) => (
          <th
            key={column}
            className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-ink/55"
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  )
}
