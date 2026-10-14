# managevent

managevent is one place where every club posts events and every student finds them.
This file is the source of truth. Humans and coding agents both read it before touching code.

---

## 1. Scope

**In (v1):** club registration and approval, event hosting, discover feed, RSVP with approval modes and payment screenshot verification, check-in, live room (quiz, doubts, speakers), post-event recap (gallery, certificates, leaderboard, technical links).

**Out (v1):** online payments (manual QR plus screenshot only), email/push notifications, multi-college support, chat, native apps, refresh tokens, event analytics.

**Roles:** `student`, `club_admin`, `super_admin` (seeded, no signup path).

---

## 2. Stack and why

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, both sides | Agents and 5 devs break contracts silently in plain JS. Types catch it. |
| Client | React + Vite, React Router, TanStack Query, Tailwind | Plain SPA is enough. No SEO need. Query handles caching and refetch. |
| Server | Node + Express | Known stack. Modular routers per owner. |
| Database | PostgreSQL | Data is relational (club -> event -> rsvp -> user). Needs transactions (capacity rule), unique constraints (one vote, one RSVP) and CHECK constraints. Mongo makes these painful. |
| ORM | Prisma | Schema file is readable by agents, migrations are generated, types flow to code. |
| Validation | zod, shared package | One schema validates the server request and types the client. |
| Auth | JWT (7 days) in `Authorization: Bearer`, bcrypt for passwords | No refresh tokens in v1. |
| Realtime | Socket.io, live room only | See 2.1. |
| Files | Multer (memory) -> Cloudinary, one service | See 2.2. |
| Tests | Vitest + Supertest | Fast, same TS setup. |

### 2.1 Where sockets are needed

Only the live room, and only server -> client pushes:

| Event | Needed? | Reason |
|---|---|---|
| `quiz:open`, `quiz:close` | Yes | Everyone must see the question start at the same moment. Polling breaks the timer fairness. |
| `quiz:results` | Yes | Pushed when a question closes. |
| `doubt:new`, `doubt:update` | Nice to have | Polling every 5s would also work. Kept on the socket since the room is already open. |
| Everything else (RSVP, approvals, feed, recap) | No | Plain REST. A refresh is fine. |

Rule: all client actions (answer, vote, ask) stay REST. Sockets only broadcast. This keeps logic testable without a socket client.
Alternative if sockets feel heavy: SSE gives the same server -> client push with less setup.

### 2.2 Why Multer exists

Express cannot read `multipart/form-data`. Multer is the parser that turns an uploaded file into `req.file`. Without it, no file reaches the server.

Files needed: club logo, event banner, payment QR, payment screenshot, speaker photo, gallery images, certificates (pdf/image).

Design: one `uploads` module owns Multer (memory storage, 5 MB images, 10 MB pdf, mime allow-list), streams the buffer to Cloudinary, stores a row, returns `{ id, url }`.
Every other endpoint accepts that `url` or `upload_id` as plain JSON. That means RSVP is JSON, not multipart: the client uploads the screenshot first, then submits the RSVP with `screenshot_upload_id`.

Payment screenshots use Cloudinary `authenticated` delivery (private). Only the club owner and the uploader can view them.

---

## 3. Repo layout and ownership

```
managevent/
  package.json            npm workspaces: client, server, shared
  README.md
  shared/
    contracts/<module>.ts   zod schemas + inferred types
    mocks/<module>.json     fixtures for UI work before the API exists
  server/
    prisma/schema.prisma
    src/
      app.ts, env.ts, errors.ts
      middleware/          requireAuth, requireRole, requireClubOwner, validate
      modules/
        auth-clubs/        Robin
        events/            Robert
        rsvp/              Roy
        live/              Baskin
        recap/             Scoop
        uploads/           Scoop
      sockets/             Baskin
  client/src/
    ui/                    Robin: design system
    features/<module>/     same names as server modules
```

| Dev | Module(s) | Owns tables |
|---|---|---|
| Robin | auth-clubs, ui, project setup | users, clubs |
| Robert | events | events, event_settings |
| Roy | rsvp | rsvps, payments |
| Baskin | live | speakers, quizzes, questions, answers, doubts, doubt_votes |
| Scoop | recap, uploads | uploads, gallery_items, certificates, leaderboard_entries, tech_links |

Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`.
Env: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

---

## 4. Agent rules (read first)

1. Work only inside your own module folders (section 3). Anything shared needs a PR note, not a silent edit.
2. Contract first. Before writing a route or page, write its zod schema in `shared/contracts/<module>.ts` and a fixture in `shared/mocks/<module>.json`.
3. Never invent endpoints, tables, fields or statuses. If it is not in this file, ask or add it to section 10 (Open questions).
4. Every endpoint returns `{ ok, data, error }` (section 5.2). No exceptions.
5. Every business rule in section 6 gets a test. A task is not done until its acceptance criteria pass.
6. Run `npm run typecheck && npm run lint && npm test` before declaring a task done.
7. Never write a second upload handler. Files go through `POST /api/uploads` only.
8. Never edit applied migrations. Add a new one.
9. One task = one small PR. Task IDs (R-01, B-03...) go in the PR title.

---

## 5. Global contracts

### 5.1 Auth

- JWT payload: `{ sub: userId, role }`.
- `requireAuth` -> 401 if missing or invalid.
- `requireRole(...roles)` -> 403 on mismatch.
- `requireClubOwner` -> loads the club or event's club and 403 unless `club.owner_id === user.id`.
- Roles are checked on the server. Client route guards are cosmetic only.

### 5.2 Response shape

```json
{ "ok": true,  "data": {}, "error": null }
{ "ok": false, "data": null, "error": { "code": "EVENT_FULL", "message": "Plain text the UI can show as is" } }
```

Error codes (extend here, not ad hoc): `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `EVENT_FULL`, `EVENT_NOT_OPEN`, `QR_REQUIRED`, `CAPACITY_BELOW_APPROVED`, `ALREADY_RSVPED`, `NOT_APPROVED`, `QUESTION_CLOSED`, `ALREADY_ANSWERED`, `RECAP_LOCKED`, `UPLOAD_REJECTED`.

### 5.3 Conventions

- IDs: UUID. Timestamps: `timestamptz`, UTC, ISO strings in JSON.
- Pagination: `?page=1&limit=20` -> `data: { items, page, limit, total }`.
- List filters via query string. Bodies validated with zod in `validate(schema)` middleware.

---

## 6. Data model

Robin writes the first migration with all tables below. After that each dev edits only their own.

- **users**: id, name, email (unique), password_hash, role, roll_number?, branch?, year?, created_at
- **clubs**: id, owner_id -> users, name (unique), logo_url, description, faculty_advisor, contact_email, socials (jsonb), status `pending|approved|rejected`, reject_reason?, created_at
- **events**: id, club_id, title, description, banner_url, venue, starts_at, ends_at, status `draft|open|live|ended`, created_at
- **event_settings**: event_id (pk), capacity, approval_mode `auto_until_full|manual`, is_paid, price?, qr_upload_id?, custom_questions (jsonb)
- **rsvps**: id, event_id, user_id, answers (jsonb), status `pending|approved|rejected|waitlist|cancelled`, checked_in_at?, created_at. Unique (event_id, user_id).
- **payments**: id, rsvp_id (unique), screenshot_upload_id, status `pending|verified|rejected`, reject_reason?, verified_by?, verified_at?
- **speakers**: id, event_id, name, bio, photo_url, topic, links (jsonb), position
- **quizzes**: id, event_id (unique), title
- **questions**: id, quiz_id, text, options (jsonb), correct_index, points, time_limit_sec, position, status `draft|open|closed`, opened_at?
- **answers**: id, question_id, user_id, chosen_index, is_correct, points_awarded, answered_at. Unique (question_id, user_id).
- **doubts**: id, event_id, user_id, text, status `open|answered`, pinned, created_at
- **doubt_votes**: doubt_id, user_id. Primary key (doubt_id, user_id).
- **uploads**: id, uploader_id, kind, mime, size, url, public_id, access `public|private`, created_at
- **gallery_items**: id, event_id, upload_id, caption, position
- **certificates**: id, event_id, user_id, upload_id, issued_at. Unique (event_id, user_id).
- **leaderboard_entries**: id, event_id, user_id, source `quiz|manual`, points, note?
- **tech_links**: id, event_id, title, description, github_url?, url?, position
- **recap_state** (on events or own table, Scoop decides): event_id, published boolean

---

## 7. State machines and business rules

Each rule is testable. Rule IDs are referenced in tasks.

### Club

- **BR-C1**: New club is `pending`. Only `approved` clubs appear in public lists or can host events.
- **BR-C2**: Only `super_admin` changes club status. Reject needs a reason.

### Event: `draft -> open -> live -> ended` (forward only)

- **BR-E1**: Only the owning club edits or changes status. Delete only in `draft`.
- **BR-E2**: Cannot move to `open` if `is_paid` and no QR.
- **BR-E3**: Capacity cannot be set below the current approved count.
- **BR-E4**: Students only see `open|live|ended` events. `draft` is club-only.
- **BR-E5**: `seats_left = capacity - approved_count`, computed, never stored.

### RSVP

- **BR-R1**: RSVP allowed only when event is `open`. One per user per event (re-RSVP after `cancelled` reuses the row).
- **BR-R2**: Capacity check runs in a DB transaction with a row lock on the event. No overselling under concurrent requests.
- **BR-R3**: `auto_until_full`, free event: approved while `approved_count < capacity`, else `waitlist`.
- **BR-R4**: `manual`: always `pending` until the club decides. Club cannot approve past capacity.
- **BR-R5**: Paid event: RSVP is `pending`. Seats count approved only. When payment is `verified`: auto mode approves if seats remain else waitlists; manual mode stays `pending` for the club.
- **BR-R6**: Payment reject needs a reason. User can resubmit a screenshot (status back to `pending`).
- **BR-R7**: Cancelling an approved RSVP in auto mode promotes the oldest `waitlist` RSVP (FIFO by created_at), inside the same transaction. Paid waitlisted users promote only if payment already verified.
- **BR-R8**: Check-in only for `approved` RSVPs, only when event is `live`. Idempotent.
- **BR-R9**: Screenshot is viewable only by uploader and club owner.

### Live room

- **BR-L1**: Join (socket and REST) requires an `approved` RSVP and event status `live`. Club owner always allowed.
- **BR-L2**: Socket handshake validates the JWT, then joins room `event:{id}` only if BR-L1 passes.
- **BR-L3**: One question `open` at a time per quiz. Opening sets `opened_at` (server time).
- **BR-L4**: Answer accepted only while question is `open` and `now <= opened_at + time_limit`. One answer per user per question.
- **BR-L5**: Score = 0 if wrong. If correct: `round(points * (0.5 + 0.5 * remaining / time_limit))`. Server computes using its own clock, never client time.
- **BR-L6**: Votes: one per user per doubt, enforced by primary key. Voting twice returns `CONFLICT`.
- **BR-L7**: Only the club owner answers, pins or deletes doubts. Correct answers are never sent to clients until the question is `closed`.

### Recap

- **BR-P1**: Recap editor and public page unlock only when event is `ended`.
- **BR-P2**: Public recap shows only after `publish`.
- **BR-P3**: Leaderboard = sum of quiz `points_awarded` per user + manual entries. Ties share rank, ordered by earliest last-answer time.
- **BR-P4**: A user downloads only their own certificate.

---

## 8. Tasks

Format: `ID | task | depends on | acceptance`. Check the box when acceptance passes.

### Robin: foundation, auth, clubs

- [ ] **R-01** Monorepo setup: workspaces, TS configs, eslint, vitest, scripts, env validation (`env.ts` with zod). | none | `npm run dev` starts client and server; `/api/health` returns ok shape.
- [ ] **R-02** Prisma schema with all tables from section 6, first migration, seed (1 super_admin, 3 approved demo clubs, 2 events, 5 students). | R-01 | `db:migrate` and `db:seed` run clean on an empty DB.
- [ ] **R-03** Error handler, `validate` middleware, response helper, CORS. | R-01 | Thrown `AppError('FORBIDDEN')` becomes the 5.2 shape with correct status.
- [ ] **R-04** Auth: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`. Signup cannot create `super_admin`. | R-02, R-03 | Duplicate email -> `CONFLICT`; wrong password -> `UNAUTHENTICATED`; JWT verifies.
- [ ] **R-05** Guards: `requireAuth`, `requireRole`, `requireClubOwner`. Export from `middleware/`. | R-04 | Unit tests for 401, 403, owner pass.
- [ ] **R-06** Design system in `client/src/ui`: tokens, Button, Input, Select, Modal, Toast, Layout, `ProtectedRoute`. | R-01 | Storybook-less demo page lists every component.
- [ ] **R-07** Pages `/login`, `/signup`. | R-04, R-06 | Login stores token, `/me` hydrates user, logout clears.
- [ ] **R-08** Clubs API: `POST/GET /api/clubs`, `GET/PATCH /api/clubs/:id`. | R-05 | BR-C1; PATCH only by owner.
- [ ] **R-09** Admin API: `GET /api/admin/clubs?status=`, `PATCH /api/admin/clubs/:id/status`. | R-05 | BR-C2.
- [ ] **R-10** Pages `/club/register`, `/club/:id`, `/club/dashboard` (shell + sidebar), `/admin/clubs`. | R-06, R-08, R-09 | Registration appears in admin queue; approval makes it public.

### Scoop: uploads first, then recap

- [ ] **S-01** `uploads` module: `POST /api/uploads` (Multer memory, mime and size allow-list, Cloudinary stream, `access` public or private). Returns `{ id, url }`. | R-03, R-05 | Rejects exe, oversize, empty file with `UPLOAD_REJECTED`; private file URL is not guessable. **Ship by day 3.**
- [ ] **S-02** Client `useUpload()` hook and `<FileInput>` component used by everyone. | S-01, R-06 | Shows progress, returns upload id.
- [ ] **S-03** Gallery: CRUD `/api/events/:id/gallery`, bulk upload, caption, reorder, lightbox. | S-01, E-03 | BR-P1.
- [ ] **S-04** Certificates: `POST /api/events/:id/certificates`, `GET /api/me/certificates`. | S-01, Y-03 | BR-P4. Assign only to approved/checked-in users.
- [ ] **S-05** Leaderboard: `GET/POST /api/events/:id/leaderboard`. | B-06 | BR-P3 with tie test.
- [ ] **S-06** Tech links: CRUD `/api/events/:id/links`. | E-03 | Validates URLs.
- [ ] **S-07** `GET /api/events/:id/recap` (one call, all four sections), `PATCH /api/events/:id/recap/publish`. | S-03..S-06 | BR-P1, BR-P2.
- [ ] **S-08** Pages `/events/:id/recap` and `/club/events/:id/recap/edit`. | S-07 | Locked state shown before `ended`.

### Robert: events

- [ ] **E-01** Events API: `POST/GET/PATCH/DELETE /api/events`, `GET /api/events/:id`, `GET /api/clubs/:id/events`. Feed supports `q`, `club`, `from`, `to`, `paid`. | R-05, R-08 | BR-E1, BR-E4, BR-E5.
- [ ] **E-02** `PATCH /api/events/:id/settings`, `POST /api/events/:id/qr` (accepts `upload_id`). | E-01, S-01 | BR-E3.
- [ ] **E-03** `PATCH /api/events/:id/status`. | E-02 | BR-E1, BR-E2; backward move returns `CONFLICT`.
- [ ] **E-04** `EventCard` component. | R-06 | Used by feed, club profile, my tickets.
- [ ] **E-05** Pages `/` (Discover with filters and pagination), `/events/:id`. | E-01, E-04 | Seats left, price, RSVP button state correct per event status.
- [ ] **E-06** Pages `/club/events`, `/club/events/new`, `/club/events/:id/edit`. | E-02, E-03, S-02 | Paid toggle requires QR before publish.

### Roy: RSVP, approvals, payments

- [ ] **Y-01** `POST /api/events/:id/rsvp` (JSON, `screenshot_upload_id` optional), `DELETE /api/rsvps/:id`, `GET /api/me/rsvps`. | E-01 | BR-R1, R2, R3, R4, R5, R7. Concurrency test: 20 parallel RSVPs on capacity 5 -> exactly 5 approved.
- [ ] **Y-02** Club side: `GET /api/events/:id/rsvps`, `PATCH /api/rsvps/:id`, `POST /api/events/:id/rsvps/bulk`. | Y-01 | BR-R4; bulk stops at capacity and reports the rest.
- [ ] **Y-03** Payments: `PATCH /api/payments/:rsvpId`. | Y-01 | BR-R5, R6, R9.
- [ ] **Y-04** Check-in: `POST /api/events/:id/checkin/:rsvpId`, CSV `GET /api/events/:id/rsvps/export`. | Y-02 | BR-R8; CSV escapes commas and quotes.
- [ ] **Y-05** Pages `/events/:id/rsvp`, `/me/tickets`. | Y-01, S-02 | Status chips, cancel works, waitlist position shown.
- [ ] **Y-06** Pages `/club/events/:id/attendees`, `/payments`, `/checkin` (mobile first). | Y-02..Y-04 | Screenshot beside user details; check-in usable at 375px width.

### Baskin: live room

- [ ] **B-01** Speakers: CRUD `/api/events/:id/speakers` + page `/club/events/:id/speakers`. | E-01, S-02 | Photo via upload service.
- [ ] **B-02** Quiz CRUD: CRUD `/api/events/:id/quizzes` (quiz + questions). | E-01 | `correct_index` hidden from non-owners in responses.
- [ ] **B-03** Socket server: auth handshake, room join per BR-L2, typed event names in `shared/contracts/live.ts`. | R-05, Y-01 | Unapproved user is refused; approved user joins.
- [ ] **B-04** Question flow: `POST /api/quizzes/:qid/questions/:id/open`, `POST /api/questions/:id/answer`, close on timer expiry or manual. Emits `quiz:open`, `quiz:close`, `quiz:results`. | B-02, B-03 | BR-L3, L4, L5, L7; late answer rejected; double answer rejected.
- [ ] **B-05** Doubts: `POST/GET /api/events/:id/doubts`, `POST /api/doubts/:id/vote`, `PATCH /api/doubts/:id`. Emits `doubt:new`, `doubt:update`. | B-03 | BR-L6, L7.
- [ ] **B-06** `GET /api/quizzes/:qid/results`. | B-04 | Per-user totals, used by Scoop.
- [ ] **B-07** Pages `/club/events/:id/quiz` (builder), `/club/events/:id/live` (control room), `/events/:id/live` (tabs: Quiz, Doubts, Speaker). | B-01..B-06 | Socket reconnect restores current question state via REST on reconnect.

---

## 9. Phases and cross-dependencies

| Days | Lands | Unblocks |
|---|---|---|
| 1 to 3 | R-01..R-06, S-01, S-02, contracts + mocks for every endpoint | Everyone builds UI against `shared/mocks`. |
| 4 to 8 | R-07..R-10, E-01..E-06, Y-01, Y-05, B-01, B-02, B-05 | Needs R-08 approval for E, E-01 for Y. |
| 9 to 13 | Y-02..Y-04, Y-06, B-03, B-04, B-06, B-07, S-03..S-08 | S-05 needs B-06; B-03 needs Y-01. |
| 14 to 16 | Integration, phone testing, one real club event end to end | Everyone. |

Rule: if your dependency is not merged, build against the mock and mark the PR `blocked-by: <ID>`.

---

## 10. Open questions

- Does a club have one admin account or several? (v1 assumes one owner per club.)
- Can students RSVP to an event that has already started? (v1 assumes no: only `open`.)
- Should check-in use a QR on the student ticket? (v1: manual list.)
- Club logos and event photos needed from club heads before launch.

---

## 11. Definition of done (v1)

A real club hosts a real event: registers, gets approved, publishes a paid event, students RSVP with screenshots, club verifies, runs a live quiz with doubts, marks the event ended and publishes a recap with gallery, certificates and leaderboard. No manual DB edits.
