import { team } from '../data/team'

export function Header() {
  return (
    <header className="relative overflow-hidden border-b border-fog-dark bg-fog">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #c3cfd4 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
          <span className="h-1.5 w-1.5 rounded-full bg-ink" />
          MJCET club events
        </p>
        <h1 className="max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          managevent: who builds what
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-ink/75 sm:text-lg">
          managevent is the one place where every MJCET club posts its events and every
          student finds them. Six developers work as peers, each owning a full slice:
          their pages, their APIs and their database tables. Nobody waits on a
          &quot;frontend team&quot; or a &quot;backend team&quot;.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          {team.map((member) => (
            <a
              key={member.id}
              href={`#${member.id}`}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: member.color }}
            >
              {member.name}
            </a>
          ))}
        </div>
      </div>
    </header>
  )
}
