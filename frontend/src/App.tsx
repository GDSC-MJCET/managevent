import type { ReactNode } from 'react'
import { Header } from './components/Header'
import { Nav } from './components/Nav'
import { ScrollTable, Section, TableHead } from './components/Section'
import { Ticket } from './components/Ticket'
import {
  balanceRows,
  ownershipRows,
  sharedRules,
  team,
  timelineRows,
  unblockRows,
} from './data/team'

const palette = [
  '#E8EDEF',
  '#13242C',
  '#C42D63',
  '#1F6F8B',
  '#B8860B',
  '#2F7D4F',
  '#8A4B2A',
  '#6B4FA0',
]

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-fog-dark bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-ink/65">{children}</div>
    </div>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <Nav />

      <main className="mx-auto max-w-6xl space-y-16 px-5 py-12 sm:px-8 sm:py-16">
        <Section id="brief" title="Creative brief for this page">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Concept">
              <p>
                Every dev gets a ticket stub, like the ones at a college fest gate.
                Read your name, read your slice. Palette comes from MJCET&apos;s
                world: fog-grey notice boards, petrol-blue ink, and six stub colours
                so you can find yourself fast.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {palette.map((color) => (
                  <span
                    key={color}
                    className="h-7 w-7 rounded-full border border-ink/10 shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <p className="text-xs leading-5 text-ink/50">
                Assumptions: six developers (Ali, Amar, Syed Ayesha, Anas, Ayub and
                Adnaan). Stack suggestion is React + Node/Express + PostgreSQL +
                Socket.io; swap it if the team already agreed on something else. Real
                club logos and MJCET photos are needed from the club heads before
                launch.
              </p>
            </Panel>

            <Panel title="Roles in the system">
              <ul className="space-y-1.5">
                <li>
                  <b className="text-ink">Student</b>: browses, RSVPs, joins live,
                  sees recaps
                </li>
                <li>
                  <b className="text-ink">Club admin</b>: registers a club, hosts
                  events, approves people, runs the live room, builds the recap
                </li>
                <li>
                  <b className="text-ink">Super admin</b>: approves new clubs (a
                  handful of staff)
                </li>
              </ul>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'React',
                  'Express',
                  'PostgreSQL',
                  'Socket.io',
                  'Multer + S3 or Cloudinary',
                  'JWT',
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-fog-dark bg-fog/70 px-2 py-1 text-xs font-semibold text-ink/70"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </Panel>
          </div>
        </Section>

        <Section
          id="balance"
          title="Balance at a glance"
          description="Everyone carries the same load: eleven REST endpoints, six or seven pages, three or four tables, and one signature challenge. Foundations (auth, sockets, uploads) are split three ways."
        >
          <ScrollTable>
            <TableHead
              columns={['Dev', 'Endpoints', 'Pages', 'Tables', 'Signature challenge']}
            />
            <tbody>
              {balanceRows.map((row) => (
                <tr key={row[0]} className="border-b border-fog last:border-0">
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={`px-4 py-3 ${
                        index === 0 ? 'font-semibold text-ink' : 'text-ink/65'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </Section>

        <Section
          id="slices"
          title="The six slices"
          description="Counts are shown on every stub so you can check the split is fair."
        >
          <div className="space-y-5">
            {team.map((member) => (
              <Ticket key={member.id} member={member} />
            ))}
          </div>
        </Section>

        <Section
          id="contract"
          title="Shared rules"
          description="Agree on these on day one. It takes 30 minutes and saves the rest of the build."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sharedRules.map(([title, description], index) => (
              <div
                key={title}
                className="rounded-xl border border-fog-dark bg-white p-4 shadow-sm"
              >
                <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink font-mono text-xs font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-ink/60">{description}</p>
              </div>
            ))}
          </div>

          <h3 className="mb-3 mt-10 font-display text-xl font-bold text-ink">
            Who owns which table
          </h3>
          <ScrollTable>
            <TableHead columns={['Table', 'Owner', 'Key fields']} />
            <tbody>
              {ownershipRows.map((row) => (
                <tr key={row[0]} className="border-b border-fog last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">
                    {row[0]}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink/80">
                    {row[1]}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </Section>

        <Section id="unblock" title="How nobody blocks anybody">
          <ScrollTable>
            <TableHead columns={['Dependency', 'Who needs it', 'Unblock rule']} />
            <tbody>
              {unblockRows.map((row) => (
                <tr key={row[0]} className="border-b border-fog last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">
                    {row[0]}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{row[1]}</td>
                  <td className="px-4 py-3 text-ink/60">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <b>If uploads slips:</b> whoever has the lightest week picks up
            /api/uploads for the first week (about a day of work). Nothing else in
            the plan changes.
          </p>
        </Section>

        <Section id="plan" title="Timeline that avoids blocking">
          <ScrollTable>
            <TableHead columns={['Phase', 'What lands', 'Who unblocks whom']} />
            <tbody>
              {timelineRows.map((row) => (
                <tr key={row[0]} className="border-b border-fog last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">
                    {row[0]}
                  </td>
                  <td className="px-4 py-3 text-ink/65">{row[1]}</td>
                  <td className="px-4 py-3 text-ink/55">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </Section>
      </main>

      <footer className="border-t border-fog-dark bg-fog/60">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-ink/55 sm:px-8">
          Drafted for the managevent project team. Update the numbers on the stubs if
          you move an endpoint between people.
        </div>
      </footer>
    </div>
  )
}

export default App
