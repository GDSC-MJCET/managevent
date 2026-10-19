const links: Array<[href: string, label: string]> = [
  ['#brief', 'Brief'],
  ['#balance', 'Balance'],
  ['#ali', 'Ali'],
  ['#amar', 'Amar'],
  ['#ayesha', 'Ayesha'],
  ['#anas', 'Anas'],
  ['#ayub', 'Ayub'],
  ['#adnaan', 'Adnaan'],
  ['#contract', 'Shared rules'],
  ['#unblock', 'Unblock rules'],
  ['#plan', 'Timeline'],
]

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-fog-dark bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2.5 sm:px-8">
        {links.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-ink/65 transition hover:bg-fog hover:text-ink"
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}
