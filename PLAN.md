# Dental App — v1 Spec & Implementation Plan

## Context

A single local dental practice wants a patient-facing mobile app plus a staff dashboard.
Today the clinic runs on phone calls and a paper clipboard: patients call to book, fill in
medical history at the front desk, and phone the clinic at 11pm when they can't remember
their aftercare instructions. This app replaces those three things — booking, intake, and
follow-up — and adds video consultations so patients don't have to drive in for a
"is this normal?" conversation.

The build target is a working demo the clinic can hold in their hands and react to
(TestFlight), not a hardened production system on day one. But because the intake captures
medical history for US patients, HIPAA constraints are designed in from the first commit
rather than retrofitted.

---

## 1. Spec Summary

### Product & users

|                    |                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Problem**        | Booking is phone-only; intake is paper; aftercare is forgotten; minor questions require a drive to the office.               |
| **Primary user**   | Patients of one local US dental practice. Open signup — anyone can join and book, so the app doubles as patient acquisition. |
| **Secondary user** | Clinic staff and dentists — the desktop dashboard for the calendar and records, the mobile app for chat and calls (D14).     |
| **Must do well**   | Book a real, confirmed appointment without calling. Everything else is supporting cast.                                      |

### Surfaces

- **`lib/app`** — Flutter. Patients, and staff for chat and calls (D14). One codebase
  compiled to iOS/Android (`flutter build ios` / `flutter build apk`) and to web
  (`flutter build web`) for the staff/dentist dashboard.
- **`lib/backend`** — Dart Frog. The API that the app calls **and** webhook endpoints
  **and** the reminder cron job. One deploy (Cloud Run), one schema.
- **`lib/models`** — Freezed models + `json_serializable` codecs for the API contract.
  Nothing else lives here.

### In scope for v1

1. Auth — Apple + Google via Supabase Auth
2. Patient onboarding: light profile + medical history
3. Dentist profiles
4. Real appointment booking (this app owns the calendar)
5. Scheduled video/audio teleconsults
6. Secure chat with the clinic, with photo attachments
7. AI dental assistant — education and triage only
8. Family members / dependents under one account
9. Visit history + post-op instructions
10. Push reminders for appointments
11. Staff dashboard: day schedule, patient records, chat, post-op notes

### Explicitly OUT of scope for v1

Payments and deposits. Insurance/ID card capture. Email and SMS channels. On-demand
calling and support presence. AI photo analysis. Multi-clinic tenancy. Web app for
patients. Loyalty, referrals, gamification. (Staff features on mobile _were_ out of
scope; chat and calling moved in — see D14. Everything else staff-facing is still web.)

### Core user journeys

**New patient**
Open app → Sign in with Apple/Google → Onboarding (4 short screens: who you are →
medical history → what brings you in → notifications permission) → Home.

The **aha moment** is the first booking: pick a service → pick a dentist → see _real
available times_ → confirm → it's booked, no phone call. Everything before it is
setup cost, so onboarding stays under 90 seconds and medical history is skippable
with "I'll do this later" (surfaced again before the first appointment).

**Returning patient**
Home shows: next appointment with a countdown (and a Join button when a teleconsult is
within 5 minutes), unread clinic messages, post-op instructions from the last visit.

**Teleconsult**
Book a service flagged `is_teleconsult` → at T-5min both sides get a Join button and the
patient gets a push → Stream Video call on `appointment-{id}` → ends → dentist attaches
post-op notes from the dashboard.

**Staff**
Sign in to web → today's schedule across all dentists → click a patient to see intake,
medical history, visit timeline → join teleconsults → reply to chat → write post-op notes.

### Data model

Source of truth is Supabase Postgres. Supabase Auth owns identity only; Stream owns call
and message content only; everything else is ours.

```
users                auth_user_id(uniq), email, role('patient'|'staff'|'dentist'), created_at
                     └─ mirrored from Supabase Auth via webhook

patients             account_user_id → users, is_self, first_name, last_name,
                     date_of_birth, phone, gender, primary_concern, referral_source,
                     last_visit_at
                     └─ family model: one account has N patients, exactly one is_self.
                        Appointments point at patients, never at users.

medical_histories    patient_id(uniq) → patients, allergies[], medications[],
                     conditions[], is_smoker, is_pregnant, anxiety_level, notes
                     └─ THE PHI TABLE. Every read/write hits audit_log.

dentists             user_id? → users, display_name, title, specialty, bio,
                     photo_url (Supabase Storage public bucket), is_active

services             name, description, duration_minutes, is_teleconsult, is_active
dentist_services     dentist_id, service_id  (who offers what)

working_hours        dentist_id, weekday(0-6), start_time, end_time   [clinic-local]
time_off             dentist_id, starts_at, ends_at, reason           [vacation + ad-hoc]

appointments         patient_id, dentist_id, service_id, starts_at, ends_at,
                     status('booked'|'cancelled'|'completed'|'no_show'),
                     stream_call_id?, cancelled_at, cancelled_by,
                     reminder_24h_sent_at, reminder_1h_sent_at
                     └─ EXCLUDE USING gist (dentist_id WITH =,
                        tstzrange(starts_at, ends_at) WITH &&) WHERE status='booked'

visit_notes          appointment_id, body, created_by → users   [post-op, patient-readable]
appointment_attachments  appointment_id, path, created_at   [booking uploads —
                     X-rays, prescriptions; private Storage bucket, path only]
ai_conversations     user_id  →  ai_messages(role, content, created_at)
push_tokens          user_id, fcm_token, updated_at
audit_log            actor_user_id, action, entity, entity_id, at
```

**Validation & invariants**

- `users.auth_user_id` unique. Exactly one `is_self` patient per account.
- An appointment's `ends_at` = `starts_at` + the service's `duration_minutes`, computed
  server-side. The client never sends a duration.
- Double-booking is prevented by the Postgres exclusion constraint above, not by
  application logic. Two simultaneous bookings for the same slot: one commits, the other
  gets a constraint violation and is shown "just taken, pick another."
- Cancel/reschedule allowed until 24h before `starts_at`. Inside that window the button
  is disabled with "please call the clinic." Enforced server-side; the client only hides
  the button.

### Scheduling engine

The one piece that must be correct. `lib/backend/lib/scheduling.dart`, pure Dart functions,
unit tested.

```
availableSlots(dentistId, serviceId, dateRange) → List<Slot>
  1. expand working_hours across the range in clinic-local time
  2. step by 15-min granularity, each candidate = [t, t + service.duration)
  3. drop candidates overlapping any booked appointment for that dentist
  4. drop candidates overlapping time_off
  5. drop candidates in the past or inside a 2-hour minimum lead time
```

Timestamps are `timestamptz` in UTC. Working hours are clinic-local wall-clock times, so
expansion goes through a single `CLINIC_TZ` constant. This is the DST bug factory — it
gets tests covering a spring-forward and a fall-back weekend.

### Architecture

```
Flutter app (iOS/Android/Web) ──Supabase session JWT──> Dart Frog route handlers ──Drift──> Supabase Postgres
   │                                              │
   │                                              ├──> OpenAI (gpt-4o-mini)   AI assistant
   │                                              ├──> Stream (server SDK)    call/chat tokens
   │                                              ├──> Supabase Storage       upload + signed URLs
   │                                              └──> FCM                     reminders
   │
   └──direct──> Stream Video / Stream Chat (client SDKs, server-issued tokens)
                (Storage uploads go through the API, not direct — D19)

Webhooks IN:  Supabase Auth `auth.users` insert/update/delete (DB webhook) → sync users table
Cloud Scheduler:  every 15 min  →  /api/cron/reminders
```

Business logic lives in Dart Frog route handlers and `lib/backend/lib/`. The Flutter app
holds no business rules — it renders what the API returns. The staff dashboard is the same
Flutter codebase compiled for web, so it reaches the data through the same HTTP API as the
phone app rather than a server-side render pass: one auth path, one rule set, one client.

### Third-party responsibilities

| Service           | Owns                                                                            | Version                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Supabase Auth** | Identity, Apple/Google OAuth, sessions, staff invites, role in `app_metadata`   | `supabase_flutter` 2.18.3, `supabase` 2.18.3 (Dart server SDK)                                                 |
| **Supabase Postgres** | All application data, source of truth                                         | `drift` 2.35.2, `drift_dev` 2.35.1                                                                             |
| **Stream**        | Video/audio calls + chat messages and their storage                             | `stream_video_flutter` 1.7.1, `stream_chat_flutter` 10.6.0                                                     |
| **Supabase Storage** | Image storage, transforms, CDN                                                | `image_picker` 1.2.4, `flutter_image_compress` 2.5.1                                                          |
| **OpenAI**        | AI assistant completions                                                        | `openai` 1.0.0, model `gpt-4o-mini`                                                                           |
| **Sentry**        | Error monitoring, every surface                                                 | `sentry_flutter` 10.1.0                                                                                        |
| **Flutter / Dart** | App runtime, builds, push delivery, state, navigation                        | `flutter` 3.x stable (Dart SDK ^3.13.5), `flutter_riverpod` 3.4.3, `go_router` 18.1.1, `firebase_messaging` 17.0.0, `flutter_local_notifications` 22.3.2 |
| **Cloud Run / Hosting** | API hosting, web hosting, cron, mobile CI                                  | `dart_frog` 1.2.6, Cloud Run, Firebase Hosting, Cloud Scheduler, Codemagic                                     |

### AI assistant behavior

Education and triage only. The system prompt hard-forbids diagnosis, prescription, and
dosage advice; every substantive answer ends by offering to book. **No patient record is
ever sent to OpenAI** — no name, DOB, medical history or appointment is ever attached to
a completion request.

That is narrower than "no PHI reaches OpenAI", and the earlier wording here overstated
it. The patient types free text; a symptom description tied to a `user_id` is
individually identifiable, and nothing stops a patient typing their own name. So the
outbound call is gated on `OPENAI_TRANSMISSION_APPROVED`, which **fails closed** — set it
only where the deployment holds no real patient data (A15) or a signed BAA covers OpenAI.
Until one of those is true in production, the assistant returns
`503 ai_transmission_blocked` rather than transmitting. The emergency card is local and
keeps working regardless.

Emergency keywords (uncontrolled bleeding, facial swelling, trouble breathing/swallowing,
knocked-out tooth, jaw trauma) short-circuit the model with a hard-coded card: call the
clinic, or 911 / nearest ER. That path must never depend on an LLM's judgment.

Conversations persist in Postgres so the thread survives an app restart.

### HIPAA posture (v1)

- Sentry `beforeSend` scrub + `sendDefaultPii: false`. No patient names, DOB, or medical
  fields in any breadcrumb or log line.
- Supabase Storage: **private bucket + signed expiring URLs** for patient dental photos;
  public bucket for dentist headshots and clinic marketing images.
- Push notification bodies are generic: _"You have an appointment tomorrow at 2:00 PM."_
  Never the procedure, specialty, or dentist name — lock screens are a disclosure surface.
- `audit_log` written on every staff read/write of `medical_histories` and `patients`.
- Postgres encryption at rest; DB pinned to a US region.
- Delete-account flow removes patient rows and revokes Stream/Storage assets.
- **BAAs required before real patient data enters the system:** Supabase, Stream,
  Sentry, Firebase (FCM), Google Cloud (Cloud Run/Hosting/Scheduler). Tracked as a risk
  below, not as code.
- **OpenAI** was originally left off that list on the strength of the overstated claim
  above. It belongs on it _unless_ `OPENAI_TRANSMISSION_APPROVED` stays unset in
  production — the gate is what keeps the omission honest.

---

## 2. ASSUMPTIONS

Each of these is a place you didn't give a firm answer and I picked a default. Correct
any of them and I'll adjust.

| #   | Assumption                                                                                                                                                                                                                                                                                                                                           | Why it's safe to change later                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A1  | **Single clinic, single location, single timezone**, held in one `CLINIC_TZ` constant.                                                                                                                                                                                                                                                               | Multi-location means a `locations` table and location-scoped hours. Contained change.    |
| A2  | **English only**, US date and time formats.                                                                                                                                                                                                                                                                                                          | No i18n framework in v1.                                                                 |
| A3  | **Dependents have no login.** A parent manages child profiles from their own account.                                                                                                                                                                                                                                                                | If a teen needs their own login later, set `patients.account_user_id` to their new user. |
| A4  | **15-minute slot granularity**, 2-hour minimum booking lead time.                                                                                                                                                                                                                                                                                    | Both are constants in `scheduling.dart`.                                                   |
| A5  | **Bookings are instantly confirmed** — no staff approval step, since the app owns the calendar.                                                                                                                                                                                                                                                      | Adding a `pending` status is a one-enum change.                                          |
| A6  | **Services and dentist working hours are seeded by us**, edited by staff in the dashboard. No self-service clinic setup wizard.                                                                                                                                                                                                                      |                                                                                          |
| A7  | **Teleconsult join window** opens 5 min before and closes 30 min after `starts_at`.                                                                                                                                                                                                                                                                  | Constant.                                                                                |
| A8  | **Reminders at 24h and 1h**, push only. Driven by Cloud Scheduler every 15 min against `/api/cron/reminders`, with `reminder_*_sent_at` columns for idempotency.                                                                                                                                                                                              | If timing needs to be exact, swap the scheduler for a Cloud Tasks queue or a Dart cron worker. Same columns. |
| A9  | **Chat is one channel per patient**, id derived as `patient-{id}` — no channel table. Staff see a shared inbox, not per-dentist threads.                                                                                                                                                                                                             |                                                                                          |
| A10 | **AI has no memory across conversations** beyond the current thread's messages.                                                                                                                                                                                                                                                                      |                                                                                          |
| A11 | **`gpt-4o-mini`** at $0.15/$0.60 per 1M tokens. Expected spend well under $5/month at clinic scale. No token budget enforcement in v1.                                                                                                                                                                                                               | Model id is one constant.                                                                |
| A12 | **No offline support.** The app requires connectivity and shows a clear offline state.                                                                                                                                                                                                                                                               | Dental booking is not an offline-first use case.                                         |
| A13 | **Polling, not real-time**, for appointment status. Stream Chat is genuinely real-time on its own.                                                                                                                                                                                                                                                   |                                                                                          |
| A14 | **A single Flutter package, not a multi-package monorepo.** One `pubspec.yaml` with `lib/app/`, `lib/backend/`, `lib/models/`, `lib/core/`, plus `dev`/`prod` build flavors (`flutter run --flavor dev`). Not Melos, not Dart pub workspaces. | The mobile and web surfaces are the same Dart codebase, so there is no cross-package code sharing to justify a monorepo. Dart pub workspaces make a later split painless, so starting as one package costs nothing. Melos is one more tool to maintain, and two packages do not need a build orchestrator. |
| A15 | **The demo runs on seeded fake patients.** Real patient data waits for signed BAAs.                                                                                                                                                                                                                                                                  | This is what makes "demo-first" and "HIPAA matters" compatible.                          |
| A16 | **Deployment: Firebase Hosting for the web build, Cloud Run for the Dart API, Fastlane/Codemagic for mobile.** GitHub Actions runs `dart analyze` + `flutter test` on push. No staging environment in v1 — a Supabase branch serves as the dev DB.                                                                                                                                                                                    |                                                                                          |

---

## 3. OPEN RISKS

**R1 — BAAs are a business blocker, not a code blocker.** Supabase, Stream, and Sentry all
gate HIPAA compliance behind paid/enterprise tiers. Nothing in the plan stops us building,
but **no real patient may use this until those are signed.** Worth pricing this week — it
may change which vendors survive.

**R2 — There is no sandboxed runtime; every run is a native build.** Stream Video's Flutter
SDK binds to native WebRTC (`stream_video` ships platform implementations for iOS and
Android), so the app cannot be hot-reloaded into a prebuilt runtime the way a managed
sandbox allows. `flutter run` recompiles the native layer every time, and any plugin
version bump forces a full rebuild — the iOS WebRTC pods also push the deployment target to
iOS 13+ and require CocoaPods. Budget for this in week one; it's the most common place
this stack stalls.

**R3 — Apple review of a health app.** Apps handling health data get extra scrutiny, and
apps offering "consultations" sometimes get asked to prove clinical legitimacy. Also
required: a privacy policy URL, accurate App Privacy nutrition labels, and Sign in with
Apple offered wherever Google sign-in is (Apple mandates this). Can delay launch by weeks.

**R4 — Timezone and DST in the scheduling engine.** The single most likely source of a
real, user-visible bug: a patient shows up an hour off. Mitigated by tests, not by care.

**R5 — Will the clinic actually use the dashboard?** If staff keep their existing system
as the real calendar, this app's calendar drifts out of sync and becomes actively
dangerous — double-booked chairs. **This is the biggest product risk in the whole plan**,
and it's worth confirming with them before we build the scheduling engine.

**R6 — Nobody staffs the chat.** Secure messaging is only valuable if someone answers.
If reply latency is measured in days, patients go back to phoning. Needs a clinic-side
owner and probably an auto-reply stating expected response time.

**R7 — AI liability.** Even scoped to education, a confidently wrong answer about tooth
pain is a real-world harm. Mitigated by hard-coded emergency short-circuits, a persistent
disclaimer, and never sending patient data — but the residual risk is nonzero.

**R8 — Stream costs at scale.** Fine for one clinic; verify the pricing tier before this
is ever used by more.

**R9 — Cross-origin Supabase Auth from the Flutter app to the Dart API** needs correct
token handling (session JWT in the `Authorization` header, verified server-side against
the Supabase Auth JWKS). Straightforward, but it's the kind of thing that eats an
afternoon.

---

## 4. Implementation Plan

Phases are ordered so that something is demoable early and the risky part (scheduling)
lands before everything that depends on it.

### Phase 0 — Foundation ✅ (except `packages/shared`, see D1; Sentry wired in mobile only)

- Single Flutter package: `lib/app/`, `lib/backend/`, `lib/models/`, `lib/core/`, with
  `dev`/`prod` flavors in `pubspec.yaml`.
- `lib/backend`: Dart Frog 1.2.6 route handlers under `lib/backend/routes/`, Drift 2.35.2
  + Supabase Postgres, Sentry.
- `lib/app`: Flutter 3.x + go_router 18.1.1, Riverpod 3.4.3, Sentry (`Sentry.init` in
  `lib/app/app.dart` with `sendDefaultPii: false`, console breadcrumbs dropped,
  `event.user` reduced to the Supabase auth uid; source maps via the `sentry_flutter`
  build-time upload with `SENTRY_AUTH_TOKEN`).
- `.env.example` in the repo root listing every key. Nothing hardcoded. The Flutter app
  loads it with `flutter_dotenv`; the API reads the same keys from its Cloud Run
  environment (or `--dart-define` for local runs).
- `analysis_options.yaml` on `flutter_lints` (swap in `very_good_analysis` for the stricter
  set); `dart analyze` is the gate.
- **`PLAN.md` written to the project root**, carrying this spec forward for future sessions.

### Phase 1 — Schema & seed ✅

- Full Drift schema per the data model above, including the raw-SQL migration for the
  `EXCLUDE USING gist` constraint (Drift won't generate it; it goes in a hand-edited
  migration file as a `customStatement`).
- Seed script (`dart run tool/seed.dart`): 3 dentists, ~8 services with real durations,
  working hours, and a handful of fake patients so screens are never empty during the demo.

### Phase 2 — Auth ✅ (backend + mobile sign-in; staff role set in Supabase Auth)

- Supabase Auth on both surfaces. Apple + Google providers only.
- `POST /api/webhooks/auth` — verify the Supabase webhook payload, sync `users`.
- Role in `app_metadata`, enforced in `lib/backend/lib/auth_helpers.dart`. Staff invited
  from the Supabase dashboard.
- Mobile: `supabase_flutter` 2.18.3 with session persistence, go_router protected routes.
  Supabase project "Dentify" (ref `dentify`). Sign-in is the browser SSO flow
  (`signInWithOAuth` launched with `LaunchMode.externalApplication`); no native sign-in
  sheet is used, so no extra iOS floor. **Apple is not enabled yet** — it needs an Apple
  Developer Services ID + key in the Supabase dashboard. Google works today.
- Shared `requireAuth()` / `requireStaff()` helpers for route handlers — written once,
  used everywhere, so authorization is never re-implemented per route.

### Phase 3 — Onboarding ✅ (see D12 — one submit at the end, not per step)

- 4 screens, skippable medical history, held in an in-memory draft and written once
  at step 4 — a drop-out before then starts over (D12).
- Writes `patients` (`is_self: true`) + `medical_histories`.
- Notification permission requested on the last screen, with a reason shown first.

### Phase 4 — Scheduling engine ✅ ← the critical phase

- `lib/backend/lib/scheduling.dart` with `availableSlots()` as specified.
- `GET /api/availability?dentistId&serviceId&from&to`
- `POST /api/appointments` — server computes `ends_at`, relies on the DB constraint,
  translates a constraint violation into a clean 409.
- `PATCH /api/appointments/:id` — cancel/reschedule with the 24h rule enforced server-side.
- **Unit tests here** (`test/scheduling_test.dart`): normal day, fully booked day, time-off
  overlap, service longer than the remaining window, lead-time boundary, DST
  spring-forward, DST fall-back, and a concurrent double-book. This is the one place
  tests are non-negotiable for v1.

### Phase 5 — Booking UX ✅ (mobile flow + appointment detail with cancel; staff schedule ✅)

- Mobile: service picker → dentist picker → calendar with real slots → confirm → detail
  screen with cancel/reschedule.
- Confirm step takes optional X-rays / documents (`appointment_attachments`, see D20).
  Staff see them on the patient's visit timeline, patients on the appointment detail.
- Web dashboard (Flutter Web): day and week views across dentists, click-through to the
  patient record (intake, medical history, visit timeline), manual block-out and cancel.

### Phase 6 — Teleconsult ✅ (foreground ringing; push needs credentials — see D16)

- `POST /api/stream/token` issues user tokens server-side, deriving the Stream
  user id from the Supabase session so a client can never name its own.
- Call id `appointment-{id}` (D9); the T-5min → T+30min window is computed
  server-side by `canJoinCall()` and shipped as `canJoin` on the appointment
  payload, the same way `canCancel` already works (D15).
- Stream Video Flutter SDK in mobile. Staff join from the **same** mobile app (D14),
  so the dashboard's separate web video client left the v1 path.
- On top of the scheduled teleconsult, either side can place a **ringing** call
  from the conversation (D16). Rings deliver over the socket, so they reach an
  app that is open. Waking a backgrounded app needs APNs VoIP + FCM
  credentials — the runbook is `docs/RINGING-PUSH.md`.
- **Requires a native build — the WebRTC plugin has no web/desktop fallback for the
  mobile target.**

### Phase 7 — Chat ✅ (attachments land on Stream's CDN, not Supabase Storage — D17)

- Stream Chat, channel `patient-{id}`, members = the patient + the staff team.
  Created and member-synced server-side by `ensureClinicChannel()`, so a staff
  member hired later is added to every existing conversation on next open.
- Patients land straight in their one conversation; staff get the shared inbox
  (`ChannelList`) and open a thread from it.
- Photo attachments currently use Stream's own upload (D17). The Supabase Storage
  private-bucket path is still the target before real patient data.

### Phase 8 — AI assistant ✅ (thread persisted in `ai_conversations` / `ai_messages`)

- `POST /api/ai/chat` — streams from `gpt-4o-mini`, persists to `ai_conversations` /
  `ai_messages`.
- Emergency keyword check runs **before** the model call and returns the hard-coded card.
- System prompt: education only, no diagnosis, no dosages, always offer to book.
- Persistent disclaimer in the chat UI header.
- Photo attachments: `POST /api/ai/attachments` uploads to Supabase Storage's **private**
  `patient-uploads/ai/{userId}` bucket path and returns two signed, expiring URLs of the one
  stored file — a `width=400&blur=40` blurred render for the thread and `width=1200` for
  the reveal.
  **The photo is never sent to OpenAI**: the reply is the hard-coded `PHOTO_REPLY`, chosen
  before any model call, and photo turns are dropped from the history the model sees.
  Clearing history deletes the patient's storage folder along with the rows.

### Phase 9 — Visit history & post-op notes ✅ (patient timeline = Past tab → appointment detail)

- Patient timeline of past appointments with their `visit_notes`.
- Staff compose notes from the appointment detail view on the dashboard.

### Phase 10 — Family members — API ✅; booking picks any family member ✅, add/edit dependents still pending

- Add/edit dependent profiles from the mobile profile screen.
- A "who is this for?" step enters the booking flow; home shows appointments across the
  whole family.

### Phase 11 — Push reminders

- `push_tokens` registration on login and on token refresh.
- `/api/cron/reminders` every 15 min: find appointments in the 24h and 1h windows with a
  null `reminder_*_sent_at`, send generic-body pushes, stamp the column.
- Teleconsult T-5min "join now" push in the same job.

### Phase 12 — Harden & ship the demo

- Sentry PHI scrubbing verified by deliberately triggering an error with a patient loaded.
- `audit_log` writes wired into every staff PHI access path.
- Empty states, offline state, and error states on every screen.
- GitHub Actions: `dart analyze` + `flutter test` (scheduling tests).
- `flutter build ipa` (Fastlane/Codemagic) → TestFlight.

---

---

## 6. Decisions since the plan was written

Recorded here because §4 above is now partly built and these differ from what it assumed.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **`packages/shared` not created — and no separate shared package either.** Freezed models + `json_serializable` codecs live in `lib/models/`, imported by both `lib/app/` and `lib/backend/`.                                                                                                                                                                                                                                                            | Both surfaces now live in one Dart package, so a shared package would only add a workspace indirection. Split it out the moment the API needs to be released independently of the client.                                                                                                                                                                                                                                                                                                                                                              |
| D2  | **Request guards live in `lib/backend/lib/auth_helpers.dart` and a Dart Frog `middleware.dart`, not inline in each route handler.**                                                                                                                                                                                                                                                                                                              | Not optional — one guard layer is what makes D3 safe. Scattering auth checks per route is how a route ends up unprotected.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D3  | **No path matching in the Dart Frog middleware.** The middleware only resolves the Supabase session and attaches it to the request context; every guard is resource-based (`requireStaff()` at the staff gate, `requireAuth()` in each route).                                                                                                                                                                                          | Path matching can diverge from how the routes are mounted and leave a resource reachable. Also lets API routes answer a mobile client with a JSON 401 instead of an HTML redirect.                                                                                                                                                                                                                                                                                                                                                                                                                |
| D4  | **`requireAuth()` upserts the `users` row** instead of waiting for the Supabase webhook.                                                                                                                                                                                                                                                                                                           | Webhook delivery is eventually consistent; a new patient must not be blocked on it. The webhook stays the backstop for updates and deletes.                                                                                                                                                                                                                                                                                                                                                                    |
| D5  | **Availability aggregates across every dentist offering the service**, and each slot carries its `dentistId`. `?dentistId=` narrows it.                                                                                                                                                                                                                                                         | The mobile booking flow picks a time, not a dentist — there is no dentist picker in the built UI.                                                                                                                                                                                                                                                                                                                                                                                                              |
| D6  | **`package:timezone` added** for clinic-local → UTC expansion.                                                                                                                                                                                                                                                                                                                                      | Hand-rolled DST math is exactly the flimsy-algorithm risk R4 warns about. One small dependency, and the DST tests prove it. The package ships the IANA database, and `TZDateTime` resolves the skipped and doubled wall-clock hours at DST boundaries.                                                                                                                                                                                                                                                                    |
| D7  | **`services` gained a `key` column** (`checkup`, `cleaning`, `pain`, `white`, `ortho`, `resto`, `followup`, `video`).                                                                                                                                                                                                                                                                           | Lets the mobile app keep its existing per-service artwork keyed to a stable id instead of matching on a display name.                                                                                                                                                                                                                                                                                                                                                                                          |
| D8  | **`push_tokens` and `attachments` tables deferred** to their own phases.                                                                                                                                                                                                                                                                                                                        | Nothing references them yet. Adding a table later is a migration; carrying an unused one is dead weight.                                                                                                                                                                                                                                                                                                                                                                                                       |
| D9  | **Teleconsult `stream_call_id` is derived server-side** as `appointment-{id}` at booking time, even though Phase 6 is not built.                                                                                                                                                                                                                                                                | It is one line at insert, and it means the call id is never client-supplied later.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D10 | **No data-fetching library on the client.** `lib/app/shared/api_client.dart` is the whole client: a Supabase-session `http` wrapper, a Riverpod `AsyncNotifier` per screen that refetches on focus, and a `meProvider` holding `/api/me`.                                                                                                                                                                                             | Refetch-on-focus is all the cache invalidation these screens need, and it is ~90 lines. Riverpod earns its place when there is state worth sharing between screens that a refocus cannot fix.                                                                                                                                                                                                                                                                                                               |
| D11 | **`service.key` rides along on appointment payloads**, not just on `/api/services`.                                                                                                                                                                                                                                                                                                             | The mobile cards pick their artwork by key (D7). Matching on a display name would break the moment the clinic renames a service.                                                                                                                                                                                                                                                                                                                                                                               |
| D12 | **Onboarding posts once, from step 4** — not per step as §4 assumed.                                                                                                                                                                                                                                                                                                                            | `hasOnboarded` is defined as "a `is_self` patient row exists". Writing that at step 1 would mark onboarding done for someone who then drops out at step 2, and they would never be asked again. Resuming a drop-out needs a separate progress flag, which v1 does not have.                                                                                                                                                                                                                                    |
| D13 | **Preferred appointment time (onboarding step 4) is collected but not stored.**                                                                                                                                                                                                                                                                                                                 | No column, and no scheduling behaviour reads it yet. Adding one is a migration for a field nothing consumes.                                                                                                                                                                                                                                                                                                                                                                                                   |
| D14 | **Staff use the same mobile app, not the dashboard, for chat and calls.** Role comes from Supabase `app_metadata.role` → `users.role` → `/api/me`; the `ShellRoute` in `lib/app/routing.dart` hides Home and Appointments for staff and relabels Messages as Inbox.                                                                                                                                                         | Calls have to be mobile-to-mobile to be answered at all — a dentist is not sat at a desktop. It also means one Stream integration instead of two, and the dashboard keeps doing what it is good at (the calendar and patient records).                                                                                                                                                                                                                                                                         |
| D15 | **`canJoin` is computed server-side** by `canJoinCall()` in `scheduling.dart` and rides on the appointment payload.                                                                                                                                                                                                                                                                               | Exactly the `canCancel` precedent: the window is a business rule, and a client that computes it owns a rule it should not. Note the ceiling flagged in the code — it gates the button, not the room.                                                                                                                                                                                                                                                                                                           |
| D16 | **Ringing calls, foreground only for now.** `getOrCreate` with `ring: true` and a fresh UUID per call; a root-level `callsProvider` (a Riverpod `StreamProvider` over the Stream Video client) renders the incoming/outgoing UI over any screen.                                                                                                                                                                                                       | Ringing over the socket needs no credentials and is fully demoable today. Push (APNs VoIP + FCM) is a credentials task, not a code task, and installing the Firebase plugins without those files breaks the Flutter iOS build — `flutter build ipa` fails on a missing `GoogleService-Info.plist`. Runbook: `docs/RINGING-PUSH.md`.                                                                                                                                                                                                                                               |
| D17 | **Chat photo attachments use Stream's upload, not Supabase Storage.**                                                                                                                                                                                                                                                                                                                                   | Stream already holds the message body, and it is on the same BAA list, so routing the image elsewhere buys nothing in v1 while costing a custom upload handler. Revisit with the rest of the storage work — the signed-URL requirement in §1 still stands for clinical photos.                                                                                                                                                                                                                                |
| D18 | **The Stream API key is served by `POST /api/stream/token`, not baked into the client bundle.**                                                                                                                                                                                                                                                                                                 | The app already has to call that endpoint for a token, so shipping the key in the bundle adds a second place to rotate it and nothing else. The var is gone from `.env.example`.                                                                                                                                                                                                                                                                                                                   |
| D19 | **Assistant photos upload _through_ `/api/ai/attachments`, not direct-to-Supabase Storage with a client-signed token** — reversing the "direct upload" arrow in §1.                                                                                                                                                                                                                                             | Supabase Storage's signed upload token authorises _an_ upload, not a destination: `bucketId`, `folder` and the object path all ride in the client's own request. Any signed-in patient could therefore write an object anywhere in the bucket, including over `/dentists`. Proxying is also the shorter path — one endpoint and one round trip instead of an auth call, an upload and an attach. Cost is the Cloud Run request body limit, which the app stays under by resizing to 1400px/JPEG-0.7 first. |
| D20 | **Booking uploads are `appointment_attachments(appointment_id, path)`** — narrower than §1's sketched `attachments(storage_object_id, patient_id, uploaded_by, context)`. Uploaded after the booking commits, one request per file, through `POST /api/appointments/{id}/attachments` (D19's reasoning applies unchanged). Every delivery URL carries a `Dentify` text-layer overlay, top-right. | `context` and `uploaded_by` are a generic attachment table's columns; the only thing that attaches anything in v1 is a patient booking an appointment, and the appointment already carries who and why. Uploading after the insert means no orphan files and no client-supplied storage path for the server to trust. The overlay is a delivery transformation, so a screenshotted or forwarded X-ray still says where it came from, and there is no branded second copy to store.                             |

## 5. Verification

**Scheduling engine (automated).** `flutter test test/scheduling_test.dart`. Covers the eight
cases in Phase 4. If these pass and the exclusion constraint is in place, the calendar is
sound.

**Double-booking (manual, and worth doing by hand once).** Two devices on the same slot,
confirm simultaneously. Exactly one succeeds; the other sees "just taken." Then confirm
in `psql` that only one `booked` row exists for that dentist and range.

**End-to-end demo script** — run this before showing the clinic:

1. Fresh signup with Apple → onboarding → land on home.
2. Book a cleaning → verify the slot disappears for other users and appears on the staff
   dashboard.
3. Book a teleconsult 10 minutes out → wait for the T-5min push → join from mobile, join
   from the dashboard → confirm two-way audio and video.
4. Send a chat message with a photo → staff replies → patient receives it.
5. Ask the AI "why does my tooth hurt when I drink cold water?" → get a useful,
   non-diagnostic answer ending in a booking offer. Then ask about facial swelling and
   trouble breathing → confirm the hard-coded emergency card appears and the model is
   never called.
6. Staff marks the appointment complete and adds post-op notes → patient sees them in
   visit history.
7. Add a dependent → book for them → confirm it shows under the parent's account.
8. Try to cancel an appointment 2 hours out → blocked with the "call the clinic" message.

**HIPAA spot-check.** Throw an error on a screen with a patient record loaded; confirm the
Sentry event carries no name, DOB, or medical field. Confirm a patient photo URL 403s once
its signature expires. Confirm a reminder push body names no procedure.
