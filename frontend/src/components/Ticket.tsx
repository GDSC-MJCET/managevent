import type { CSSProperties } from 'react'
import type { TeamMember } from '../data/team'

const methodStyles: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-800',
  POST: 'bg-sky-100 text-sky-800',
  PUT: 'bg-violet-100 text-violet-800',
  PATCH: 'bg-amber-100 text-amber-800',
  DELETE: 'bg-rose-100 text-rose-800',
  MW: 'bg-ink text-white',
  WS: 'bg-ink text-white',
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/60 bg-white/70 px-2.5 py-2">
      <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink/45">
        {label}
      </span>
      <b className="text-lg leading-tight text-ink">{value}</b>
    </div>
  )
}

export function Ticket({ member }: { member: TeamMember }) {
  const endpointCount = member.api.filter(
    ([method]) => method !== 'MW' && method !== 'WS',
  ).length

  const style = {
    '--accent': member.color,
    borderTopColor: member.color,
  } as CSSProperties

  return (
    <article
      id={member.id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-fog-dark border-t-4 bg-white shadow-sm"
      style={style}
    >
      <div className="grid md:grid-cols-[15.5rem_1fr]">
        <div
          className="relative border-b border-dashed border-fog-dark p-5 md:border-b-0 md:border-r"
          style={{ backgroundColor: `${member.color}0f` }}
        >
          <span className="absolute -right-2 top-0 hidden h-4 w-4 -translate-y-1/2 rounded-full border border-fog-dark bg-paper md:block" />
          <span className="absolute -right-2 bottom-0 hidden h-4 w-4 translate-y-1/2 rounded-full border border-fog-dark bg-paper md:block" />
          <p
            className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: member.color }}
          >
            Ticket {String(member.id).slice(0, 2).toUpperCase()}
          </p>
          <h3 className="font-display text-2xl font-bold text-ink">{member.name}</h3>
          <p className="mt-1 text-sm leading-5 text-ink/60">{member.role}</p>
          <div className="mt-5 grid grid-cols-3 gap-1.5">
            <Tally label="Pages" value={member.pages.length} />
            <Tally label="Endpoints" value={endpointCount} />
            <Tally label="Tables" value={member.tables.length} />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink/45">
            Tables owned
          </h4>
          <div className="mb-6 flex flex-wrap gap-1.5">
            {member.tables.map((table) => (
              <code
                key={table}
                className="rounded-md border border-fog-dark bg-fog/60 px-2 py-1 font-mono text-xs text-ink"
              >
                {table}
              </code>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink/45">
                Frontend
              </h4>
              <ul className="space-y-2.5">
                {member.pages.map(([path, description]) => (
                  <li key={path} className="text-sm leading-5">
                    <code className="font-mono text-xs font-semibold text-ink">
                      {path}
                    </code>
                    <span className="block text-ink/55">{description}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink/45">
                Backend
              </h4>
              <div className="overflow-x-auto rounded-xl border border-fog-dark">
                <table className="w-full min-w-[24rem] border-collapse text-left text-xs">
                  <tbody>
                    {member.api.map(([method, path, description], index) => (
                      <tr
                        key={`${method}-${path}-${index}`}
                        className="border-b border-fog last:border-0"
                      >
                        <td className="w-16 px-2 py-2 align-top">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-mono text-[0.6rem] font-bold ${
                              methodStyles[method] ?? 'bg-fog text-ink'
                            }`}
                          >
                            {method}
                          </span>
                        </td>
                        <td className="px-2 py-2 align-top font-mono text-[0.7rem] leading-4 text-ink">
                          {path}
                        </td>
                        <td className="px-2 py-2 align-top leading-4 text-ink/55">
                          {description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {member.notes.map((note) => (
            <p
              key={note}
              className="mt-4 rounded-r-lg border-l-2 bg-fog/50 px-3 py-2 text-xs leading-5 text-ink/65"
              style={{ borderLeftColor: member.color }}
            >
              {note}
            </p>
          ))}
        </div>
      </div>
    </article>
  )
}
