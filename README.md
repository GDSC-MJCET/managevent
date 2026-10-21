# managevent

managevent is one place where every MJCET club posts events and every student finds them.
This file is the source of truth. Humans and coding agents both read it before touching code.

Six developers work as peers. Each owns a full slice: their pages, their APIs and their database tables. Nobody waits on a "frontend team" or a "backend team".

---

## 1. Scope

**In (v1):** club registration and approval, event hosting, discover feed, RSVP with approval modes and payment screenshot verification, check-in, live room (quiz, doubts, speakers), post-event recap (gallery, certificates, leaderboard, technical links).

**Out (v1):** online payments (manual QR plus screenshot only), email/push notifications, multi-college support, chat, native apps, refresh tokens, event analytics.

**Roles:**

- `student`: browses, RSVPs, joins live, sees recaps
- `club_admin`: registers a club, hosts events, approves people, runs the live room, builds the recap
- `super_admin`: approves new clubs (a handful of staff). Seeded, no signup path.

### 1.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, both sides | Agents and 6 devs break contracts silently in plain JS. Types catch it. |
| Client | React + Vite, React Router, TanStack Query, Tailwind | Plain SPA is enough. No SEO need. Query handles caching and refetch. |
| Server | Node + Express | Known stack. Modular routers per owner. |
| Database | PostgreSQL | Data is relational (club -> event -> rsvp -> user). Needs transactions (capacity rule), unique constraints (one vote, one RSVP) and CHECK constraints. |
| ORM | Prisma | Schema file is readable by agents, migrations are generated, types flow to code. |
| Validation | zod, shared package | One schema validates the server request and types the client. |
| Auth | JWT (7 days) in `Authorization: Bearer`, bcrypt for passwords | No refresh tokens in v1. |
| Realtime | Socket.io, live room only | Server -> client pushes only. |
| Files | Multer (memory) -> Cloudinary, one uploads service | One handler for the whole app. |
| Tests | Vitest + Supertest | Fast, same TS setup. |

Swap any of these only if the whole team agrees first.

---

## 2. Who builds what

Everyone carries the same load: eleven REST endpoints, six or seven pages, three or four tables, and one signature challenge. Foundations (auth, sockets, uploads) are split three ways.

| Dev | Module(s) | Endpoints | Pages | Tables | Signature challenge |
|---|---|---|---|---|---|
| Ali | `auth-rsvp` | 11 + 4 guards | 6 | 3 | Auth, guards, the RSVP capacity and waitlist engine |
| Amar | `quiz-live`, `sockets` | 11 + WebSocket gateway | 6 | 4 | Socket gateway, live quiz engine, live client state |
|Syeda Ayesha | `events` | 11 | 7 | 4 | Event lifecycle state machine, discovery feed, live doubts board |
| Anas | `attendee-ops` | 11 | 6 | 3 | Approval and payment workflow, event-day check-in, dynamic form builder |
| Ayub | `clubs-uploads`, `ui` | 11 | 6 | 3 | Club approval workflow, upload service, design system |
| Adnaan | `recap` | 11 | 6 | 4 | Recap aggregation, bulk gallery, certificate assignment |

### 2.1 Slice summaries

**Ali: Identity and the RSVP engine**
- Tables: `users`, `password_resets`, `rsvps`
- Pages: `/login`, `/signup`, `/profile/complete`, `/events/:id/rsvp`, `/me/tickets`, `AuthContext` and route guards
- Also owns: project setup, the first migration, env config, CORS, error handler, the seed script, and `rsvpService.transition()`

**Amar: Live quiz engine and sockets**
- Tables: `quizzes`, `questions`, `quiz_answers`, `leaderboard_entries`
- Pages: `/events/:id/live` (tabs: Quiz, Ask a doubt, Meet the speaker), `/club/events/:id/live` (control room), `/club/events/:id/quiz` (builder), quiz results screen, `LeaderboardPanel`, `useSocket` hook and room state
- Also owns: the socket gateway and `emitToRoom(eventId, name, payload)`

**Syeda Ayesha: Events and live doubts**
- Tables: `events`, `event_settings`, `doubts`, `doubt_votes`
- Pages: `/` (Discover), `/events/:id`, `/club/events`, `/club/events/new`, `/club/events/:id/edit`, Doubts board (audience tab and club moderation panel), `EventCard`

**Anas: Attendee ops, payments and event day**
- Tables: `payments`, `checkins`, `rsvp_form_fields`
- Pages: `/club/events/:id/attendees`, `/club/events/:id/payments`, `/club/events/:id/checkin`, `/club/events/:id/rsvp-form`, `/club/events/:id/ops`, CSV export

**Ayub: Clubs, uploads, speakers and design system**
- Tables: `clubs`, `speakers`, `uploads`
- Pages: `/club/register`, `/club/:id`, `/club/dashboard` (shell, sidebar, nav), `/admin/clubs`, `/club/events/:id/speakers` plus `SpeakerSection`, design system
- Also owns: `POST /api/uploads`, used by everyone

**Adnaan: Recap, gallery and certificates**
- Tables: `gallery_items`, `certificates`, `tech_links`, `recap_settings`
- Pages: `/events/:id/recap`, `/club/events/:id/recap/edit`, Gallery, Certificates (club assign view and `/me/certificates`), Technical links section, publish gating

### 2.2 Who owns which table

| Tables | Owner | Key fields |
|---|---|---|
| users, password_resets, rsvps | Ali | role, email, roll_no, branch, year; reset token and expiry; event_id, user_id, answers, status (pending, approved, rejected, waitlist, cancelled) |
| quizzes, questions, quiz_answers, leaderboard_entries | Amar | quiz state, timer, correct option, points per answer, rank, manual points |
| events, event_settings, doubts, doubt_votes | Ayesha | club_id, capacity, approval_mode (auto_until_full or manual), is_paid, price, qr_url, status (draft, open, live, ended); upvote count, pinned |
| payments, checkins, rsvp_form_fields | Anas | rsvp_id, screenshot_url, verified_by, reject reason; checked_in_at; question label, type, required, order |
| clubs, speakers, uploads | Ayub | club status (pending, approved, rejected), owner_id; name, bio, photo, topic; file_url, mime, size |
| gallery_items, certificates, tech_links, recap_settings | Adnaan | event_id, file_url, caption, position; user_id, file_url; link title and url; published flag |

### 2.3 Repo layout

```
managevent/
  package.json            npm workspaces: client, server, shared
  README.md
  shared/
    contracts/<module>.ts   zod schemas + inferred types
    mocks/<endpoint>.json   request and response example per endpoint
  server/
    prisma/schema.prisma
    src/
      app.ts, env.ts, errors.ts
      middleware/          requireAuth, requireRole, requireClubOwner, requireApprovedAttendee, validate
      modules/
        auth-rsvp/         Ali
        quiz-live/         Amar
        events/            Ayesha
        attendee-ops/      Anas
        clubs-uploads/     Ayub
        recap/             Adnaan
      sockets/             Amar
  client/src/
    ui/                    Ayub: design system
    features/<module>/     same names as server modules
```

Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`.
Env: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

### 2.4 Peer review ring

Ali reviews Amar, Amar reviews Ayesha, Ayesha reviews Anas, Anas reviews Ayub, Ayub reviews Adnaan, Adnaan reviews Ali.

---

## 3. Agent rules (read first)

1. Work only inside your own module folders (section 2.3). Anything shared needs a PR, not a silent edit.
2. Contract first. Before writing logic, write the zod schema in `shared/contracts/<module>.ts` and a fixture in `shared/mocks/<endpoint>.json` with a request and response example. UI is built against these until the real endpoint lands.
3. Never invent endpoints, tables, fields or statuses. If it is not in this file, ask or add it to section 9 (Open questions).
4. Every endpoint returns `{ ok, data, error }` (section 4.2). No exceptions.
5. Every business rule in section 6 gets a test. A task is not done until its acceptance criteria pass.
6. Run `npm run typecheck && npm run lint && npm test` before declaring a task done.
7. Never write a second upload handler. Files go through `POST /api/uploads` only.
8. **Nobody writes `rsvps.status` directly.** Everyone calls Ali's `rsvpService.transition()`, so the capacity rule lives in one place.
9. Schema owner is Ali for the first migration (all 21 tables as stubs). After that, each dev edits only their own tables.
10. Never edit applied migrations. Add a new one.
11. One task = one small PR. Task IDs (AL-01, AM-03...) go in the PR title.

---

## 4. Global contracts

### 4.1 Auth

- JWT payload: `{ sub: userId, role }`.
- `requireAuth` -> 401 if missing or invalid.
- `requireRole(...roles)` -> 403 on mismatch.
- `requireClubOwner` -> loads the club or event's club and 403 unless `club.owner_id === user.id`.
- `requireApprovedAttendee` -> 403 unless the user has an `approved` RSVP for the event. Club owner always passes.
- Guards ship with a fake-user mode (and `requireApprovedAttendee` returns true in mock mode) so nobody is blocked.
- Roles are checked on the server. Client route guards are cosmetic only.

### 4.2 Response shape

```json
{ "ok": true,  "data": {}, "error": null }
{ "ok": false, "data": null, "error": { "code": "EVENT_FULL", "message": "Plain text the UI can show as is" } }
```

Error codes (extend here, not ad hoc): `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `EVENT_FULL`, `EVENT_NOT_OPEN`, `QR_REQUIRED`, `CAPACITY_BELOW_APPROVED`, `ALREADY_RSVPED`, `NOT_APPROVED`, `QUESTION_CLOSED`, `ALREADY_ANSWERED`, `RECAP_LOCKED`, `UPLOAD_REJECTED`.

### 4.3 Conventions

- IDs: UUID. Timestamps: `timestamptz`, UTC, ISO strings in JSON.
- Pagination: `?page=1&limit=20` -> `data: { items, page, limit, total }`.
- List filters via query string. Bodies validated with zod in `validate(schema)` middleware.
- Files: upload first through `POST /api/uploads`, which returns `{ id, url }`. Every other endpoint takes that `url` or `upload_id` as plain JSON, so RSVP is JSON, not multipart.
- Realtime: sockets only broadcast server -> client. All client actions (answer, vote, ask) stay REST.

### 4.4 Shared services

| Service | Owner | Used by |
|---|---|---|
| `rsvpService.transition()` | Ali | Anas (approve, reject, waitlist, payment verified) |
| `emitToRoom(eventId, name, payload)` | Amar | Ayesha (`doubt:new`, `doubt:update`) |
| `POST /api/uploads` | Ayub | Everyone |
| `requireApprovedAttendee` | Ali | Amar (room access) |

---

## 5. Data model

Ali writes the first migration with all 21 tables below as stubs. After that each dev edits only their own.

**Ali**
- **users**: id, name, email (unique), password_hash, role, roll_number?, branch?, year?, created_at
- **password_resets**: id, user_id, token_hash, expires_at, used_at?
- **rsvps**: id, event_id, user_id, answers (jsonb), status `pending|approved|rejected|waitlist|cancelled`, created_at. Unique (event_id, user_id).

**Amar**
- **quizzes**: id, event_id, title, created_at
- **questions**: id, quiz_id, text, options (jsonb), correct_index, points, time_limit_sec, position, status `draft|open|closed`, opened_at?
- **quiz_answers**: id, question_id, user_id, chosen_index, is_correct, points_awarded, answered_at. Unique (question_id, user_id).
- **leaderboard_entries**: id, event_id, user_id, source `quiz|manual`, points, note?

**Ayesha**
- **events**: id, club_id, title, description, banner_url, venue, starts_at, ends_at, status `draft|open|live|ended`, created_at
- **event_settings**: event_id (pk), capacity, approval_mode `auto_until_full|manual`, is_paid, price?, qr_url?
- **doubts**: id, event_id, user_id, text, status `open|answered`, answer?, pinned, created_at
- **doubt_votes**: doubt_id, user_id. Primary key (doubt_id, user_id).

**Anas**
- **payments**: id, rsvp_id (unique), screenshot_url, status `pending|verified|rejected`, reject_reason?, verified_by?, verified_at?
- **checkins**: id, rsvp_id (unique), checked_in_at, checked_in_by
- **rsvp_form_fields**: id, event_id, label, type, required, position. JSON shape fixed on day 1.

**Ayub**
- **clubs**: id, owner_id -> users, name (unique), logo_url, description, faculty_advisor, contact_email, socials (jsonb), status `pending|approved|rejected`, reject_reason?, created_at
- **speakers**: id, event_id, name, bio, photo_url, topic, links (jsonb), position
- **uploads**: id, uploader_id, kind, mime, size, file_url, public_id, access `public|private`, created_at

**Adnaan**
- **gallery_items**: id, event_id, file_url, caption, position
- **certificates**: id, event_id, user_id, file_url, issued_at. Unique (event_id, user_id).
- **tech_links**: id, event_id, title, description, github_url?, url?, position
- **recap_settings**: event_id (pk), published boolean, published_at?

---

## 6. State machines and business rules

Each rule is testable. Rule IDs are referenced in tasks.

### Club

- **BR-C1**: New club is `pending`. Only `approved` clubs appear in public lists or can host events.
- **BR-C2**: Only `super_admin` changes club status. Reject needs a reason.

### Event: `draft -> open -> live -> ended` (forward only)

- **BR-E1**: Only the owning club edits or changes status. Delete only in `draft`. Invalid transitions return `CONFLICT`.
- **BR-E2**: Cannot move to `open` if `is_paid` and no QR (`QR_REQUIRED`).
- **BR-E3**: Capacity cannot be set below the current approved count (`CAPACITY_BELOW_APPROVED`).
- **BR-E4**: Students only see `open|live|ended` events. `draft` is club-only.
- **BR-E5**: `seats_left = capacity - approved_count`, computed, never stored.

### RSVP

- **BR-R1**: RSVP allowed only when event is `open`. One per user per event (re-RSVP after `cancelled` reuses the row).
- **BR-R2**: Capacity check runs in one DB transaction with a row lock on the event. No overselling under concurrent requests.
- **BR-R3**: `auto_until_full`, free event: approved while `approved_count < capacity`, else `waitlist`.
- **BR-R4**: `manual`: always `pending` until the club decides. Club cannot approve past capacity.
- **BR-R5**: Paid event: RSVP is `pending`. Seats count approved only. When payment is `verified`: auto mode approves if seats remain else waitlists; manual mode stays `pending` for the club.
- **BR-R6**: Payment reject needs a reason. User can resubmit a screenshot (status back to `pending`).
- **BR-R7**: Cancelling an approved RSVP in auto mode promotes the oldest `waitlist` RSVP (FIFO by created_at), inside the same transaction. Paid waitlisted users promote only if payment already verified.
- **BR-R8**: Check-in only for `approved` RSVPs, only when event is `live`. Idempotent. Undo is allowed.
- **BR-R9**: Payment screenshot is viewable only by uploader and club owner.
- **BR-R10**: All `rsvps.status` writes go through `rsvpService.transition()`.

### Live room

- **BR-L1**: Join (socket and REST) requires an `approved` RSVP and event status `live`. Club owner always allowed.
- **BR-L2**: Socket handshake validates the JWT, then joins room `event:{id}` only if BR-L1 passes.
- **BR-L3**: One question `open` at a time per quiz. Opening sets `opened_at` (server time).
- **BR-L4**: Answer accepted only while question is `open` and `now <= opened_at + time_limit`. One answer per user per question.
- **BR-L5**: Score = 0 if wrong. If correct: `round(points * (0.5 + 0.5 * remaining / time_limit))`. Server computes using its own clock, never client time.
- **BR-L6**: Votes: one per user per doubt, enforced by primary key. Voting twice returns `CONFLICT`.
- **BR-L7**: Only the club owner answers or pins doubts. Correct answers are never sent to clients until the question is `closed`.

### Recap

- **BR-P1**: Recap editor and public page unlock only when event is `ended` (`RECAP_LOCKED`).
- **BR-P2**: Public recap shows only after `publish`.
- **BR-P3**: Leaderboard = sum of quiz `points_awarded` per user + manual entries. Ties share rank, ordered by earliest last-answer time.
- **BR-P4**: A user downloads only their own certificate.

---

## 7. Tasks

Format: `ID | task | depends on | acceptance`. Check the box when acceptance passes.

### Ali: identity and the RSVP engine

- [ ] **AL-01** Monorepo setup: workspaces, TS configs, eslint, vitest, scripts, env validation (`env.ts` with zod), error handler, `validate` middleware, response helper, CORS. | none | `npm run dev` starts client and server; `/api/health` returns the ok shape; thrown `AppError('FORBIDDEN')` becomes the 4.2 shape with correct status.
- [ ] **AL-02** Prisma schema with all 21 tables as stubs, first migration, seed (1 super_admin, 3 approved demo clubs, 2 events, 5 students). | AL-01 | `db:migrate` and `db:seed` run clean on an empty DB.
- [ ] **AL-03** Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`. Signup cannot create `super_admin`. | AL-02 | Duplicate email -> `CONFLICT`; wrong password -> `UNAUTHENTICATED`; JWT verifies.
- [ ] **AL-04** Guards: `requireAuth`, `requireRole`, `requireClubOwner`, `requireApprovedAttendee`, with fake-user mode. Export from `middleware/`. **Ship by day 2.** | AL-03 | Unit tests for 401, 403, owner pass, approved attendee pass.
- [ ] **AL-05** Export `rsvpService.transition()` as an interface first, real implementation with AL-07. | AL-02 | Anas can import it and call it against the stub.
- [ ] **AL-06** Profile and password: `PATCH /api/auth/me` (roll number, branch, year), `PATCH /api/auth/password`, `POST /api/auth/forgot`, `POST /api/auth/reset`. | AL-03 | Reset token expires and is single use; wrong current password is rejected.
- [ ] **AL-07** RSVP engine: `POST /api/events/:id/rsvp`, real `rsvpService.transition()`. Uses a default form until Anas's `rsvp_form_fields` shape lands. | AL-05, AY-01 | BR-R1 to R5, R10. Concurrency test: 20 parallel RSVPs on capacity 5 -> exactly 5 approved.
- [ ] **AL-08** `DELETE /api/rsvps/:id` (cancel, then promote from the waitlist), `GET /api/me/rsvps`, `GET /api/events/:id/rsvp/me`. | AL-07 | BR-R7 test: cancel promotes the oldest waitlisted user in the same transaction.
- [ ] **AL-09** Client: `AuthContext`, route guards, pages `/login`, `/signup`, `/profile/complete`. | AL-03, AB-02 | Login stores token, `/me` hydrates user, logout clears; profile asked once before the first RSVP.
- [ ] **AL-10** Pages `/events/:id/rsvp`, `/me/tickets`. | AL-07, AL-08, AB-05 | Profile details, custom questions and payment screenshot (if paid) submit; status chips for pending, approved, rejected, waitlist; cancel works.

### Amar: live quiz engine and sockets

- [ ] **AM-01** Socket gateway: handshake auth, room join, presence. Publish `emitToRoom(eventId, name, payload)` as a no-op by day 2, real after. Typed event names in `shared/contracts/live.ts`. | AL-04 | BR-L1, L2. Unapproved user is refused; approved user joins; club owner always joins.
- [ ] **AM-02** Quiz CRUD: `POST/GET /api/events/:id/quizzes`, `PUT/DELETE /api/quizzes/:qid` (whole quiz with questions). | AY-01 | `correct_index` hidden from non-owners in responses.
- [ ] **AM-03** Question flow: `POST /api/quizzes/:qid/questions/:id/open`, `POST /api/quizzes/:qid/questions/:id/close`, `POST /api/questions/:id/answer`. Close on timer expiry or manually. Emits `quiz:open`, `quiz:close`, `quiz:results`. | AM-01, AM-02 | BR-L3, L4, L5, L7; late answer rejected; double answer rejected.
- [ ] **AM-04** `GET /api/quizzes/:qid/results` (per-user scores), `GET /api/quizzes/:qid/state` (reconnect snapshot). | AM-03 | Snapshot restores current question and remaining time.
- [ ] **AM-05** Leaderboard: `GET/POST /api/events/:id/leaderboard` (ranked list, manual points). | AM-04 | BR-P3 with tie test. Mock JSON published early for Adnaan.
- [ ] **AM-06** Client: `useSocket` hook, reconnect, room state store. | AM-01 | Reconnect restores current question state via `/state`.
- [ ] **AM-07** Pages `/club/events/:id/quiz` (builder: questions, options, correct answer, points, timer), `/club/events/:id/live` (control room: start and close each question, see who answered). | AM-02, AM-03, AB-02 | Club runs a full quiz end to end.
- [ ] **AM-08** Pages `/events/:id/live` (tabs: Quiz, Ask a doubt, Meet the speaker), quiz results screen, `LeaderboardPanel` (reusable, also used in the recap). | AM-04, AM-05, AM-06 | Approved attendees only; panel renders ranked list from the real or mock endpoint.

### Syed Ayesha: events and live doubts

- [ ] **AY-01** Events API: `POST /api/events` (with settings), `GET /api/events` (feed: `q`, `club`, `from`, `to`, `paid`, pagination), `GET /api/events/:id` (with seats left), `PATCH /api/events/:id` (details, capacity, approval mode, price, QR url), `DELETE /api/events/:id`. | AL-04, AB-03 | BR-E1, E3, E4, E5. Only approved clubs can host.
- [ ] **AY-02** `PATCH /api/events/:id/status`, `GET /api/clubs/:id/events`. | AY-01 | BR-E1, E2; backward move returns `CONFLICT`; paid event without QR cannot open.
- [ ] **AY-03** Doubts API: `POST/GET /api/events/:id/doubts` (list sorted by votes), `POST /api/doubts/:id/vote`, `PATCH /api/doubts/:id` (answer or pin). Emits `doubt:new`, `doubt:update` via `emitToRoom()`. | AY-01, AM-01 | BR-L6, L7; voting twice returns `CONFLICT`.
- [ ] **AY-04** `EventCard` component. | AB-02 | Used by feed, club profile and my tickets.
- [ ] **AY-05** Pages `/` (Discover with search, club, date, free or paid filters, pagination) and `/events/:id` (banner, schedule, venue, seats left, price, speakers preview, RSVP button). | AY-01, AY-04 | RSVP button state correct per event status.
- [ ] **AY-06** Pages `/club/events` (status chips), `/club/events/new` (multi-step host form, paid toggle with QR upload), `/club/events/:id/edit` (publish, go live, end). | AY-02, AB-05 | Paid toggle requires QR before publish.
- [ ] **AY-07** Doubts board: audience tab to ask and upvote, club moderation panel to answer or pin. | AY-03, AM-06 | New doubts and updates appear live in the room.

### Anas: attendee ops, payments and event day

- [ ] **AN-01** Fix the JSON shape of `rsvp_form_fields` on day 1 (contract and mock). `GET/PUT /api/events/:id/rsvp-form`. | AL-04 | Ali's RSVP form reads the saved questions; required fields enforced.
- [ ] **AN-02** Attendees: `GET /api/events/:id/rsvps` (club-only, filters), `PATCH /api/rsvps/:id` (approve, reject, waitlist), `POST /api/events/:id/rsvps/bulk`, `GET /api/events/:id/rsvps/export` (CSV). Always through `rsvpService.transition()`. | AL-05, AL-07 | BR-R4, R10; bulk stops at capacity and reports the rest; CSV escapes commas and quotes.
- [ ] **AN-03** Payments: `GET /api/events/:id/payments`, `PATCH /api/payments/:rsvpId` (verify or reject with reason). | AN-02 | BR-R5, R6, R9.
- [ ] **AN-04** Check-in: `POST/DELETE /api/events/:id/checkin/:rsvpId`, `GET /api/events/:id/ops` (registered, approved, checked-in counts). | AN-02 | BR-R8; idempotent; undo works.
- [ ] **AN-05** Pages `/club/events/:id/attendees` (approve, reject, waitlist one by one or in bulk, CSV export), `/club/events/:id/rsvp-form` (question builder). | AN-01, AN-02, AB-02 | Table updates after each action; builder saves and reloads.
- [ ] **AN-06** Page `/club/events/:id/payments`: verification queue, screenshot lightbox beside the person's details, verify or reject with reason. | AN-03 | Screenshot beside user details.
- [ ] **AN-07** Pages `/club/events/:id/checkin` (mobile first) and `/club/events/:id/ops` (event-day dashboard). | AN-04 | Check-in usable at 375px width; counts update.

### Ayub: clubs, uploads, speakers and design system

- [ ] **AB-01** `POST /api/uploads` stub that returns a fake URL. **Ship day 1.** | none | Everyone can call it.
- [ ] **AB-02** Design system in `client/src/ui`: tokens, buttons, form fields, modal, toast, app layout, `ProtectedRoute`. **Ship tokens by day 3.** | none | Demo page lists every component.
- [ ] **AB-03** Clubs API: `POST /api/clubs`, `GET /api/clubs`, `GET /api/clubs/:id`, `PATCH /api/clubs/:id`. | AL-04 | BR-C1; PATCH only by owner.
- [ ] **AB-04** Admin API: `GET /api/admin/clubs?status=`, `PATCH /api/admin/clubs/:id/status`. | AL-04 | BR-C2.
- [ ] **AB-05** Real upload service: Multer memory storage, image and pdf with size and type limits (5 MB images, 10 MB pdf), Cloudinary stream, `access` public or private. Returns `{ id, url }`. **Land by day 4, Ali reviewing.** | AB-01, AL-03 | Rejects exe, oversize and empty file with `UPLOAD_REJECTED`; private file URL is not guessable.
- [ ] **AB-06** Speakers: `POST/GET /api/events/:id/speakers`, `PATCH/DELETE /api/speakers/:id`. | AY-01, AB-05 | Photo via upload service.
- [ ] **AB-07** Pages `/club/register`, `/club/:id`, `/club/dashboard` (shell, sidebar, nav), `/admin/clubs`. | AB-02, AB-03, AB-04 | Registration appears in admin queue; approval makes it public.
- [ ] **AB-08** Page `/club/events/:id/speakers` and `SpeakerSection` component used in the live room and event detail. | AB-06 | Add, edit and remove speakers; section renders in both places.

### Adnaan: recap, gallery and certificates

- [ ] **AD-01** Gallery: `POST /api/events/:id/gallery` (bulk upload), `PATCH /api/events/:id/gallery` (captions and reorder), `DELETE /api/gallery/:id`. | AB-05, AY-02 | BR-P1.
- [ ] **AD-02** Certificates: `POST /api/events/:id/certificates` (upload and assign), `GET /api/me/certificates`, `GET /api/events/:id/certificates` (club view). | AB-05, AN-04 | BR-P4. Assign only to approved or checked-in users.
- [ ] **AD-03** Technical links: `POST /api/events/:id/links`, `PATCH/DELETE /api/links/:id`. | AY-02 | Validates URLs.
- [ ] **AD-04** `GET /api/events/:id/recap` (one call for the whole page), `PATCH /api/events/:id/recap/publish`. Reads leaderboard from `/shared/mocks` until Amar's endpoint lands, and speakers from Ayub. | AD-01 to AD-03 | BR-P1, P2.
- [ ] **AD-05** Gallery UI: bulk image upload, captions, reorder, lightbox viewer. Technical links section: project cards with title, description, GitHub link and any link the club wants explored. | AD-01, AD-03 | Reorder persists; lightbox works.
- [ ] **AD-06** Certificates UI: club assign view and `/me/certificates`. | AD-02 | Each person downloads only theirs.
- [ ] **AD-07** Pages `/events/:id/recap` and `/club/events/:id/recap/edit`, publish gating. Embeds `LeaderboardPanel`. | AD-04, AM-08 | Locked state shown before `ended`; hidden until published.

---

## 8. How nobody blocks anybody

| Dependency | Who needs it | Unblock rule |
|---|---|---|
| Migration, guards, JWT | Everyone | Ali ships the migration with all 21 tables as stubs and the guards with a fake-user mode by day 2. Ayub and Amar ship their own foundations in parallel. |
| `POST /api/uploads` | Ayesha (QR), Anas (screenshots), Adnaan (gallery), Ayub (logos) | Ayub deploys a stub that returns a fake URL on day 1. The real implementation lands by day 4, with Ali reviewing. |
| Socket gateway | Ayesha (doubts) | Amar publishes `emitToRoom(eventId, name, payload)` as a no-op on day 2. |
| RSVP status transitions | Anas | Ali exports `rsvpService.transition()` as an interface first. |
| RSVP form schema | Ali's RSVP POST | Fix the JSON shape of `rsvp_form_fields` on day 1. Until then Ali uses a default form. |
| Room access | Amar | He calls `requireApprovedAttendee` from Ali, which returns true in mock mode. |
| Quiz scores | Adnaan | He reads `GET /api/events/:id/leaderboard` from `shared/mocks` until Amar's real one lands. |

If uploads slips, whoever has the lightest week picks up `/api/uploads` for the first week (about a day of work). Nothing else in the plan changes.

If your dependency is not merged, build against the mock and mark the PR `blocked-by: <ID>`.

---

## 9. Phases

| Phase | What lands | Who unblocks whom |
|---|---|---|
| Days 1 to 3 | Repo, migration, auth, guards, upload stub, socket stub, design tokens, mock JSON for every endpoint (AL-01 to AL-05, AM-01, AB-01, AB-02) | Ali, Amar and Ayub ship foundations. Others build UI against mock JSON in `shared/mocks`. |
| Days 4 to 8 | Club registration, host-event form, discover feed, RSVP flow, real upload service, RSVP form builder (AB-03 to AB-07, AY-01 to AY-06, AL-06 to AL-10, AN-01, AB-05) | Ayesha needs Ayub's club approval. Anas needs Ali's transition service and Ayesha's event detail. |
| Days 9 to 13 | Attendee approval queue, payment verification, check-in, live quiz with sockets, doubts board, recap page and gallery (AN-02 to AN-07, AM-02 to AM-08, AY-07, AD-01 to AD-07) | Adnaan reads Amar's leaderboard and Ayub's speakers. Amar reads Ali's approved status for room access. |
| Days 14 to 16 | Integration, bug bash on one real club event, phone testing | Everyone. Pick one real club to test with. |

Real club logos and MJCET photos are needed from the club heads before launch.

---

## 10. Open questions

- Does a club have one admin account or several? (v1 assumes one owner per club.)
- Can students RSVP to an event that has already started? (v1 assumes no: only `open`.)
- Should check-in use a QR on the student ticket? (v1: manual list.)
- Email is out of scope, so how is the password reset link delivered in v1? (Suggested: logged to the server console for staff to share.)
- Who creates the `payments` row when a paid RSVP is submitted: Ali's RSVP endpoint calling an Anas helper, or Anas's module? Also, which endpoint lets a user resubmit a rejected screenshot (BR-R6)? Neither is in the endpoint lists yet.
- Club logos and event photos needed from club heads before launch.

---

## 11. Definition of done (v1)

A real club hosts a real event: registers, gets approved, publishes a paid event, students RSVP with screenshots, club verifies, runs a live quiz with doubts, marks the event ended and publishes a recap with gallery, certificates and leaderboard. No manual DB edits.
