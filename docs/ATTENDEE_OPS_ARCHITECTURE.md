# Attendee Operations, Payments & Event-Day Architecture (AN-01 - AN-07)

**Slice Owner:** Anas (`attendee-ops`)  
**Target Branch:** `dev`  
**Peer Review Ring:** Reviewed by **Ayesha** | Anas reviews **Ayub**

---

## 1. High-Level Architecture & Teammate Integration

The `attendee-ops` slice sits at the core of event lifecycle operations — bridging student RSVPs, club host decisions, payment verification, and day-of check-ins:

```mermaid
flowchart TB
    subgraph AyeshaModule["🎪 Ayesha: events"]
        EventModel["Event & EventSettings<br/>(status: draft -> open -> live -> ended)<br/>(capacity, approval_mode, is_paid)"]
    end

    subgraph AliModule["🔐 Ali: auth-rsvp"]
        AuthGuards["Guards & Middleware<br/>(requireAuth, requireClubOwner)"]
        RsvpEngine["rsvpService.transition()<br/>(Capacity Lock, Auto/Manual, Waitlist Promotion)"]
        StudentRsvp["Student RSVP Endpoint<br/>POST /api/events/:id/rsvp"]
    end

    subgraph AyubModule["☁️ Ayub: clubs-uploads"]
        UploadSvc["POST /api/uploads<br/>(Payment Screenshot CDN URL)"]
    end

    subgraph AnasModule["⚡ Anas: attendee-ops (Our Slice)"]
        direction TB
        subgraph AN01["1. Dynamic Form Builder (AN-01 / AN-05)"]
            FormApi["GET / PUT /api/events/:id/rsvp-form"]
            FormTable[("rsvp_form_fields")]
        end

        subgraph AN02["2. Attendee Management (AN-02 / AN-05)"]
            AttendeeApi["GET /api/events/:id/rsvps<br/>PATCH /api/rsvps/:id<br/>POST /api/events/:id/rsvps/bulk<br/>GET /api/events/:id/rsvps/export (CSV)"]
        end

        subgraph AN03["3. Payment Verification (AN-03 / AN-06)"]
            PaymentApi["GET /api/events/:id/payments<br/>PATCH /api/payments/:rsvpId"]
            PaymentTable[("payments")]
        end

        subgraph AN04["4. Event-Day Operations (AN-04 / AN-07)"]
            CheckinApi["POST / DELETE /api/events/:id/checkin/:rsvpId<br/>GET /api/events/:id/ops"]
            CheckinTable[("checkins")]
        end
    end

    subgraph AdnanModule["🏆 Adnan: recap"]
        Certificates["Certificates Assignment (AD-02)<br/>(Assigned only to checked-in attendees)"]
    end

    %% Handshakes
    AuthGuards -->|Protects club endpoints| AnasModule
    EventModel -->|Supplies status & settings| AnasModule
    UploadSvc -->|screenshot_url| PaymentTable

    FormTable -->|Saved questions schema| StudentRsvp
    AttendeeApi -->|Delegates all status writes via BR-R10| RsvpEngine
    PaymentApi -->|Triggers payment_verified / payment_rejected| RsvpEngine
    EventModel -.->|Requires status === live via BR-R8| CheckinApi
    CheckinTable -->|Attendance verification| Certificates
```

---

## 2. Teammate Dependencies Matrix

| Teammate | What Anas Needs from Them (Inbound) | What They Need from Anas (Outbound) |
|---|---|---|
| **Ali** (`auth-rsvp`) | 1. **`requireAuth` & `requireClubOwner`** route guards.<br/>2. **`AL-02` Migration**: Base tables (`users`, `rsvps`, `events`, `clubs`) and `options Json?` on `rsvp_form_fields`.<br/>3. **`rsvpService.transition()` (BR-R10)**: All attendee status updates (`approved`, `rejected`, `waitlist`, `payment_verified`, `payment_rejected`) must delegate here to preserve capacity lock and FIFO waitlist promotions. | 1. **Dynamic Questions (`GET /api/events/:id/rsvp-form`)**: Ali's student RSVP submission (`POST /api/events/:id/rsvp`) reads Anas's custom questions to validate and save student responses in `rsvps.answers` (jsonb).<br/>2. **Payment Trigger**: Anas's payment verification triggers Ali's auto/manual approval rules. |
| **Ayesha** (`events`) | 1. **`event.status`**: Check-in (`POST /api/events/:id/checkin/:rsvpId`) strictly requires `event.status === 'live'` (**BR-R8**).<br/>2. **`event_settings`**: `capacity` and `approval_mode` (`auto_until_full` \| `manual`) used to validate bulk approvals. | 1. **Real-time Ops Counts (`GET /api/events/:id/ops`)**: Provides `registeredCount`, `approvedCount`, and `checkedInCount` for the live event dashboard and control room. |
| **Ayub** (`clubs-uploads`) | 1. **`POST /api/uploads`**: Students upload payment proof through Ayub's upload service; the resulting URL is stored in `payments.screenshot_url` and reviewed in Anas's payment queue. | 1. Peer review: Anas conducts code reviews for Ayub's pull requests. |
| **Adnan** (`recap`) | — | 1. **`checkins` Table**: Adnan's certificate assignment engine (**AD-02 / BR-P4**) inspects Anas's `checkins` table to ensure certificates are only issued to students who physically checked in. |

---

## 3. Core Operational Flows

### Flow 1: Dynamic RSVP Form Builder (AN-01 & AN-05)

Clubs configure custom survey questions (e.g., T-shirt size, dietary needs, GitHub handles); Ali's student registration loads them dynamically:

```mermaid
sequenceDiagram
    autonumber
    actor ClubHost as Club Admin (Frontend)
    participant AnasAPI as Anas: /api/events/:id/rsvp-form
    participant DB as DB: rsvp_form_fields
    actor Student as Student (Ali's Page)

    ClubHost->>AnasAPI: PUT questions (label, type, options, required, position)
    AnasAPI->>DB: Atomic replace & re-order questions
    AnasAPI-->>ClubHost: { ok: true, data: { fields } }

    Note over Student, AnasAPI: Student opens /events/:id/rsvp
    Student->>AnasAPI: GET /api/events/:id/rsvp-form (Public)
    AnasAPI->>DB: Fetch fields ORDER BY position ASC
    AnasAPI-->>Student: Renders dynamic inputs in Ali's registration form
```

---

### Flow 2: Attendee Status & Payment Queue (AN-02, AN-03, BR-R5, BR-R6, BR-R10)

Per **BR-R10**, `attendee-ops` never touches `rsvps.status` directly. It delegates to Ali's `rsvpService.transition()`, ensuring capacity is never oversold:

```mermaid
sequenceDiagram
    autonumber
    actor ClubAdmin as Club Admin
    participant AnasCtrl as Anas: attendee-ops Controller
    participant AliEngine as Ali: rsvpService.transition()
    participant PayDB as DB: payments
    participant RsvpDB as DB: rsvps

    alt Verify Payment (BR-R5)
        ClubAdmin->>AnasCtrl: PATCH /api/payments/:rsvpId { action: "verify" }
        AnasCtrl->>AliEngine: transition({ toStatus: "payment_verified", rsvpId })
        AliEngine->>RsvpDB: Check event capacity & approval mode
        Note over AliEngine: auto_until_full + space left -> approved<br/>auto_until_full + full -> waitlist<br/>manual -> stays pending
        AliEngine-->>AnasCtrl: { success: true, rsvp }
        AnasCtrl->>PayDB: UPDATE payments SET status = 'verified', verifiedAt, verifiedBy
        AnasCtrl-->>ClubAdmin: { ok: true, data: payment }
    else Reject Payment (BR-R6)
        ClubAdmin->>AnasCtrl: PATCH /api/payments/:rsvpId { action: "reject", rejectReason: "..." }
        AnasCtrl->>PayDB: SET status = 'rejected', reject_reason = "..."
        AnasCtrl->>AliEngine: transition({ toStatus: "payment_rejected", rsvpId })
        Note over AliEngine: Keeps RSVP in pending state for screenshot re-upload
        AnasCtrl-->>ClubAdmin: { ok: true }
    else Bulk Approval (AN-02)
        ClubAdmin->>AnasCtrl: POST /api/events/:id/rsvps/bulk { rsvpIds: [...] }
        loop For each rsvpId (stops when capacity reached)
            AnasCtrl->>AliEngine: transition({ toStatus: "approved", rsvpId })
        end
        AnasCtrl-->>ClubAdmin: { ok: true, data: { approvedCount, waitlistedCount } }
    end
```

---

### Flow 3: Event-Day Live Check-in & Metrics (AN-04 & AN-07, BR-R8)

Enforces event lifecycle gatekeeping and idempotent check-ins:

```mermaid
sequenceDiagram
    autonumber
    actor Volunteer as Club Volunteer / Scanner
    participant AnasCheckin as Anas: /api/events/:id/checkin/:rsvpId
    participant AyeshaEvents as Ayesha: events Table
    participant RsvpDB as DB: rsvps
    participant CheckinDB as DB: checkins

    Volunteer->>AnasCheckin: POST /api/events/:id/checkin/:rsvpId
    
    AnasCheckin->>AyeshaEvents: Verify event status
    alt event.status !== 'live'
        AnasCheckin-->>Volunteer: 409 CONFLICT (Event is not live yet)
    end

    AnasCheckin->>RsvpDB: Verify RSVP status
    alt rsvp.status !== 'approved'
        AnasCheckin-->>Volunteer: 403 FORBIDDEN (Only approved attendees may check in)
    end

    AnasCheckin->>CheckinDB: INSERT INTO checkins (rsvp_id, checked_in_by, checked_in_at)
    Note over AnasCheckin: Idempotent: If already checked in, returns 200 with original timestamp
    AnasCheckin-->>Volunteer: 200 OK { ok: true, data: { checkedIn: true, at, by } }
```

---

## 4. Database Schema Ownership

Defined in `backend/prisma/schema.prisma`:

```prisma
model RsvpFormField {
  id        String        @id @default(uuid()) @db.Uuid
  eventId   String        @map("event_id") @db.Uuid
  label     String
  type      RsvpFieldType
  required  Boolean       @default(false)
  position  Int           @default(0)
  options   Json?         // Supported for select & checkbox (min 2 items)

  event     Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([eventId, position])
  @@map("rsvp_form_fields")
}

model Payment {
  id            String        @id @default(uuid()) @db.Uuid
  rsvpId        String        @unique @map("rsvp_id") @db.Uuid
  screenshotUrl String        @map("screenshot_url")
  status        PaymentStatus @default(pending)
  rejectReason  String?       @map("reject_reason")
  verifiedBy    String?       @map("verified_by") @db.Uuid
  verifiedAt    DateTime?     @map("verified_at")
  createdAt     DateTime      @default(now()) @map("created_at")

  rsvp          Rsvp          @relation(fields: [rsvpId], references: [id], onDelete: Cascade)

  @@map("payments")
}

model Checkin {
  id          String   @id @default(uuid()) @db.Uuid
  rsvpId      String   @unique @map("rsvp_id") @db.Uuid
  checkedInAt DateTime @default(now()) @map("checked_in_at")
  checkedInBy String   @map("checked_in_by") @db.Uuid

  rsvp        Rsvp     @relation(fields: [rsvpId], references: [id], onDelete: Cascade)

  @@map("checkins")
}
```

---

## 5. Endpoints Overview (11 Total)

| Endpoint | Method | Role / Guard | Description |
|---|---|---|---|
| `/api/events/:id/rsvp-form` | `GET` | Public | Fetch custom form questions sorted by position |
| `/api/events/:id/rsvp-form` | `PUT` | `requireClubOwner` | Create or update custom RSVP questions |
| `/api/events/:id/rsvps` | `GET` | `requireClubOwner` | List attendees with pagination & status filters |
| `/api/rsvps/:id` | `PATCH` | `requireClubOwner` | Transition single attendee status (`approved`, `rejected`, `waitlist`) |
| `/api/events/:id/rsvps/bulk` | `POST` | `requireClubOwner` | Atomic bulk approval up to event capacity |
| `/api/events/:id/rsvps/export` | `GET` | `requireClubOwner` | Streamed CSV attendee export with RFC 4180 escaping |
| `/api/events/:id/payments` | `GET` | `requireClubOwner` | Club payment verification queue |
| `/api/payments/:rsvpId` | `PATCH` | `requireClubOwner` | Verify or reject payment screenshot with reason |
| `/api/events/:id/checkin/:rsvpId` | `POST` | `requireClubOwner` | Mark attendee present (event must be live) |
| `/api/events/:id/checkin/:rsvpId` | `DELETE` | `requireClubOwner` | Revert accidental check-in |
| `/api/events/:id/ops` | `GET` | `requireClubOwner` | Real-time counts (`registered`, `approved`, `checkedIn`) |
