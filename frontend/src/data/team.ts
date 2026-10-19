export type ApiEndpoint = [method: string, path: string, description: string]
export type Page = [path: string, description: string]

export type TeamMember = {
  id: string
  name: string
  role: string
  color: string
  tables: string[]
  pages: Page[]
  api: ApiEndpoint[]
  notes: string[]
}

export const team: TeamMember[] = [
  {
    id: 'ali',
    name: 'Ali',
    role: 'Identity and the RSVP engine',
    color: '#C42D63',
    tables: ['users', 'password_resets', 'rsvps'],
    pages: [
      ['/login', 'Sign in for students and club admins'],
      ['/signup', 'Create an account, role chosen at signup'],
      ['/profile/complete', 'Roll number, branch and year, asked once before the first RSVP'],
      ['/events/:id/rsvp', 'Audience RSVP form: profile details, custom questions, payment screenshot if paid'],
      ['/me/tickets', 'My RSVPs with status: pending, approved, rejected, waitlist. Cancel option'],
      ['AuthContext and route guards', 'Client session state and protected routes by role'],
    ],
    api: [
      ['POST', '/api/auth/signup', 'Create user'],
      ['POST', '/api/auth/login', 'Return JWT'],
      ['GET', '/api/auth/me', 'Current user and role'],
      ['PATCH', '/api/auth/me', 'Roll number, branch, year'],
      ['PATCH', '/api/auth/password', 'Change password'],
      ['POST', '/api/auth/forgot', 'Send reset link'],
      ['POST', '/api/auth/reset', 'Set new password'],
      ['POST', '/api/events/:id/rsvp', 'Runs the capacity rule in one DB transaction'],
      ['GET', '/api/me/rsvps', 'My tickets'],
      ['DELETE', '/api/rsvps/:id', 'Cancel, then promote from the waitlist'],
      ['GET', '/api/events/:id/rsvp/me', 'My status for this event'],
      ['MW', 'requireAuth, requireRole, requireClubOwner, requireApprovedAttendee', 'Shared guards for everyone'],
    ],
    notes: [
      'Rules he owns: the capacity check runs in one DB transaction. Auto mode approves until full and then waitlists. Manual mode leaves everyone pending. Paid events stay pending until Anas\'s payment verification.',
      'Also owns: project setup, the first migration, env config, CORS, error handler, the seed script, and rsvpService.transition() that Anas calls.',
    ],
  },
  {
    id: 'amar',
    name: 'Amar',
    role: 'Live quiz engine and sockets',
    color: '#1F6F8B',
    tables: ['quizzes', 'questions', 'quiz_answers', 'leaderboard_entries'],
    pages: [
      ['/events/:id/live', 'Audience room shell with tabs: Quiz, Ask a doubt, Meet the speaker. Approved attendees only'],
      ['/club/events/:id/live', 'Control room: start and close each question, see who answered'],
      ['/club/events/:id/quiz', 'Quiz builder: questions, options, correct answer, points, timer'],
      ['Quiz results screen', 'Per-user scores after each quiz'],
      ['LeaderboardPanel', 'Reusable ranked list, also used in the recap page'],
      ['useSocket hook and room state', 'Client connection, reconnect and live room store'],
    ],
    api: [
      ['POST', '/api/events/:id/quizzes', 'Create quiz'],
      ['GET', '/api/events/:id/quizzes', 'List quizzes'],
      ['PUT', '/api/quizzes/:qid', 'Whole quiz with questions'],
      ['DELETE', '/api/quizzes/:qid', 'Remove quiz'],
      ['POST', '/api/quizzes/:qid/questions/:id/open', 'Start a question'],
      ['POST', '/api/quizzes/:qid/questions/:id/close', 'Close a question'],
      ['POST', '/api/questions/:id/answer', 'Submit, scored by correctness and speed'],
      ['GET', '/api/quizzes/:qid/results', 'Per-user scores'],
      ['GET', '/api/quizzes/:qid/state', 'Reconnect snapshot'],
      ['GET', '/api/events/:id/leaderboard', 'Ranked list'],
      ['POST', '/api/events/:id/leaderboard', 'Manual points'],
      ['WS', 'handshake auth, room join, presence', 'Gateway foundation'],
      ['WS', 'quiz:open, quiz:close, quiz:results', 'Pushed to the room'],
    ],
    notes: [
      'Also exposes a helper emitToRoom(eventId, name, payload) that Ayesha uses for live doubts. Room access calls Ali\'s requireApprovedAttendee.',
    ],
  },
  {
    id: 'ayesha',
    name: 'Syed Ayesha',
    role: 'Events and live doubts',
    color: '#B8860B',
    tables: ['events', 'event_settings', 'doubts', 'doubt_votes'],
    pages: [
      ['/ (Discover)', 'All MJCET events from every club, with search, club, date and free or paid filters'],
      ['/events/:id', 'Event detail: banner, schedule, venue, seats left, price, speakers preview, RSVP button'],
      ['/club/events', 'Club\'s own events with status chips: draft, open, live, ended'],
      ['/club/events/new', 'Multi-step host-event form. Capacity, approval mode, paid toggle with payment QR upload'],
      ['/club/events/:id/edit', 'Edit details, publish, go live, end'],
      ['Doubts board', 'Audience tab to ask and upvote, plus a club moderation panel to answer or pin'],
      ['EventCard component', 'One reusable card used by the feed, club profile and my tickets'],
    ],
    api: [
      ['POST', '/api/events', 'Create event with settings'],
      ['GET', '/api/events', 'Feed: search, club, date, free or paid, pagination'],
      ['GET', '/api/events/:id', 'Detail with seats left'],
      ['PATCH', '/api/events/:id', 'Details, capacity, approval mode, price, QR url'],
      ['DELETE', '/api/events/:id', 'Delete draft only'],
      ['PATCH', '/api/events/:id/status', 'draft, open, live, ended'],
      ['GET', '/api/clubs/:id/events', 'Events per club'],
      ['POST', '/api/events/:id/doubts', 'Ask'],
      ['GET', '/api/events/:id/doubts', 'List, sorted by votes'],
      ['POST', '/api/doubts/:id/vote', 'Upvote once per user'],
      ['PATCH', '/api/doubts/:id', 'Answer or pin'],
    ],
    notes: [
      'Rules she owns: a paid event cannot be published without a QR, capacity cannot drop below the approved count, and only valid status transitions are allowed.',
      'Doubts push live through Amar\'s emitToRoom() (doubt:new, doubt:update).',
    ],
  },
  {
    id: 'anas',
    name: 'Anas',
    role: 'Attendee ops, payments and event day',
    color: '#2F7D4F',
    tables: ['payments', 'checkins', 'rsvp_form_fields'],
    pages: [
      ['/club/events/:id/attendees', 'Table of everyone who filled the form. Approve, reject or waitlist one by one, or in bulk'],
      ['/club/events/:id/payments', 'Verification queue: screenshot lightbox beside the person\'s details, verify or reject with reason'],
      ['/club/events/:id/checkin', 'Mobile-first check-in list for the gate on event day'],
      ['/club/events/:id/rsvp-form', 'Question builder for custom RSVP questions'],
      ['/club/events/:id/ops', 'Event-day dashboard: registered, approved and checked-in counts'],
      ['CSV export', 'Download attendee list'],
    ],
    api: [
      ['GET', '/api/events/:id/rsvps', 'Club-only list with filters'],
      ['PATCH', '/api/rsvps/:id', 'Approve, reject, waitlist'],
      ['POST', '/api/events/:id/rsvps/bulk', 'Approve many'],
      ['GET', '/api/events/:id/rsvps/export', 'CSV'],
      ['GET', '/api/events/:id/payments', 'Payment queue'],
      ['PATCH', '/api/payments/:rsvpId', 'Verify or reject with reason'],
      ['POST', '/api/events/:id/checkin/:rsvpId', 'Mark present'],
      ['DELETE', '/api/events/:id/checkin/:rsvpId', 'Undo check-in'],
      ['GET', '/api/events/:id/ops', 'Registered, approved, checked-in counts'],
      ['GET', '/api/events/:id/rsvp-form', 'Custom questions'],
      ['PUT', '/api/events/:id/rsvp-form', 'Save custom questions'],
    ],
    notes: [
      'Contract: he never writes rsvps.status directly. He calls Ali\'s rsvpService.transition(), so the capacity rule stays in one place.',
    ],
  },
  {
    id: 'ayub',
    name: 'Ayub',
    role: 'Clubs, uploads, speakers and design system',
    color: '#8A4B2A',
    tables: ['clubs', 'speakers', 'uploads'],
    pages: [
      ['/club/register', 'Club registration form: name, logo, description, faculty advisor, contact, socials'],
      ['/club/:id', 'Public club profile with its upcoming and past events'],
      ['/club/dashboard', 'Club admin home: the shell, sidebar and nav every club page sits inside'],
      ['/admin/clubs', 'Super admin queue to approve or reject new clubs'],
      ['/club/events/:id/speakers', 'Add and edit speakers, plus a SpeakerSection component used in the live room and event detail'],
      ['Design system', 'Tokens, buttons, form fields, modal, toast, app layout'],
    ],
    api: [
      ['POST', '/api/clubs', 'Submit a club for approval'],
      ['GET', '/api/clubs', 'List approved clubs'],
      ['GET', '/api/clubs/:id', 'Club profile'],
      ['PATCH', '/api/clubs/:id', 'Edit own club'],
      ['GET', '/api/admin/clubs?status=', 'Pending list'],
      ['PATCH', '/api/admin/clubs/:id/status', 'Approve or reject'],
      ['POST', '/api/uploads', 'Shared service: image and pdf, size and type limits. Used by all'],
      ['POST', '/api/events/:id/speakers', 'Add speaker'],
      ['GET', '/api/events/:id/speakers', 'List speakers'],
      ['PATCH', '/api/speakers/:id', 'Edit speaker'],
      ['DELETE', '/api/speakers/:id', 'Remove speaker'],
    ],
    notes: [
      'Risk: /api/uploads is on the critical path. Ayub ships a stub that returns a fake URL on day 1, and the real service lands by day 4 with Ali reviewing.',
    ],
  },
  {
    id: 'adnaan',
    name: 'Adnaan',
    role: 'Recap, gallery and certificates',
    color: '#6B4FA0',
    tables: ['gallery_items', 'certificates', 'tech_links', 'recap_settings'],
    pages: [
      ['/events/:id/recap', 'Public recap page: gallery, certificates, leaderboard, technical section'],
      ['/club/events/:id/recap/edit', 'Club editor for all sections of the recap'],
      ['Gallery', 'Bulk image upload, captions, reorder, lightbox viewer'],
      ['Certificates', 'Club assign view and /me/certificates so each person downloads theirs'],
      ['Technical links section', 'Project cards with title, description, GitHub link and any link the club wants explored'],
      ['Publish gating', 'Recap stays hidden until the club publishes it'],
    ],
    api: [
      ['POST', '/api/events/:id/gallery', 'Bulk upload'],
      ['PATCH', '/api/events/:id/gallery', 'Captions and reorder'],
      ['DELETE', '/api/gallery/:id', 'Remove image'],
      ['POST', '/api/events/:id/certificates', 'Upload and assign'],
      ['GET', '/api/me/certificates', 'My certificates'],
      ['GET', '/api/events/:id/certificates', 'Club view'],
      ['POST', '/api/events/:id/links', 'Add technical link'],
      ['PATCH', '/api/links/:id', 'Edit link'],
      ['DELETE', '/api/links/:id', 'Remove link'],
      ['GET', '/api/events/:id/recap', 'One call for the whole page'],
      ['PATCH', '/api/events/:id/recap/publish', 'Show recap to public'],
    ],
    notes: [
      'Rule: the recap unlocks only when the event status is ended. It embeds Amar\'s LeaderboardPanel and reads Ayub\'s speakers. Until Amar\'s endpoint lands he reads the leaderboard from /mocks.',
    ],
  },
]

export const balanceRows = [
  ['Ali', '11 + 4 guards', '6', '3', 'Auth, guards, the RSVP capacity and waitlist engine'],
  ['Amar', '11 + WebSocket gateway', '6', '4', 'Socket gateway, live quiz engine, live client state'],
  ['Syed Ayesha', '11', '7', '4', 'Event lifecycle state machine, discovery feed, live doubts board'],
  ['Anas', '11', '6', '3', 'Approval and payment workflow, event-day check-in, dynamic form builder'],
  ['Ayub', '11', '6', '3', 'Club approval workflow, upload service, design system'],
  ['Adnaan', '11', '6', '4', 'Recap aggregation, bulk gallery, certificate assignment'],
]

export const ownershipRows = [
  ['users, password_resets, rsvps', 'Ali', 'role, email, roll_no, branch, year; reset token and expiry; event_id, user_id, answers, status (pending, approved, rejected, waitlist)'],
  ['quizzes, questions, quiz_answers, leaderboard_entries', 'Amar', 'quiz state, timer, correct option, points per answer, rank, manual points'],
  ['events, event_settings, doubts, doubt_votes', 'Ayesha', 'club_id, capacity, approval_mode (auto_until_full or manual), is_paid, price, qr_url, status (draft, open, live, ended); upvote count, pinned'],
  ['payments, checkins, rsvp_form_fields', 'Anas', 'rsvp_id, screenshot_url, verified_by, reject reason; checked_in_at; question label, type, required, order'],
  ['clubs, speakers, uploads', 'Ayub', 'club status (pending, approved), owner_id; name, bio, photo, topic; file_url, mime, size'],
  ['gallery_items, certificates, tech_links, recap_settings', 'Adnaan', 'event_id, file_url, caption, position; user_id, file_url; link title and url; published flag'],
]

export const sharedRules = [
  ['One repo, six folders', 'Backend routes live in /server/modules/<name>, pages in /client/src/features/<name>. Touch only your own folder; open a PR for anything shared.'],
  ['Response shape', 'Every API returns { ok, data, error }. Errors carry a plain message the UI can show as is.'],
  ['Contract files first', 'Before writing logic, every dev commits /mocks/<endpoint>.json with a request and response example. UI is built against these until the real endpoint lands.'],
  ['Schema owner', 'Ali runs the first migration with all 21 tables as stubs. After that, each dev edits only their own tables.'],
  ['Status writes', 'Nobody writes rsvps.status directly. Everyone calls Ali\'s rsvpService.transition(), so the capacity rule lives in one place.'],
  ['Peer review ring', 'Ali reviews Amar, Amar reviews Ayesha, Ayesha reviews Anas, Anas reviews Ayub, Ayub reviews Adnaan, Adnaan reviews Ali. Everyone reviews one person and is reviewed by one.'],
]

export const unblockRows = [
  ['Migration, guards, JWT', 'Everyone', 'Ali ships the migration with all 21 tables as stubs and the guards with a fake-user mode by day 2. Ayub and Amar ship their own foundations in parallel.'],
  ['POST /api/uploads', 'Ayesha (QR), Anas (screenshots), Adnaan (gallery), Ayub (logos)', 'Ayub deploys a stub that returns a fake URL on day 1. The real implementation lands by day 4, with Ali reviewing.'],
  ['Socket gateway', 'Ayesha (doubts)', 'Amar publishes emitToRoom(eventId, name, payload) as a no-op on day 2.'],
  ['RSVP status transitions', 'Anas', 'Ali exports rsvpService.transition() as an interface first.'],
  ['RSVP form schema', 'Ali\'s RSVP POST', 'Fix the JSON shape of rsvp_form_fields on day 1. Until then Ali uses a default form.'],
  ['Room access', 'Amar', 'He calls requireApprovedAttendee from Ali, which returns true in mock mode.'],
  ['Quiz scores', 'Adnaan', 'He reads GET /api/events/:id/leaderboard from /mocks until Amar\'s real one lands.'],
]

export const timelineRows = [
  ['Days 1 to 3', 'Repo, migration, auth, guards, upload stub, socket stub, design tokens, mock JSON for every endpoint', 'Ali, Amar and Ayub ship foundations. Others build UI against mock JSON in /mocks.'],
  ['Days 4 to 8', 'Club registration, host-event form, discover feed, RSVP flow, real upload service, RSVP form builder', 'Ayesha needs Ayub\'s club approval. Anas needs Ali\'s transition service and Ayesha\'s event detail.'],
  ['Days 9 to 13', 'Attendee approval queue, payment verification, check-in, live quiz with sockets, doubts board, recap page and gallery', 'Adnaan reads Amar\'s leaderboard and Ayub\'s speakers. Amar reads Ali\'s approved status for room access.'],
  ['Days 14 to 16', 'Integration, bug bash on one real club event, phone testing', 'Everyone. Pick one real club to test with.'],
]
