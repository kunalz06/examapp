# ExamCore

A Next.js 16 + Supabase examination platform designed for Vercel.

## Included

- Email/password authentication with Supabase SSR cookies.
- Student and admin roles enforced in Postgres/RLS.
- Admin exam builder for single-choice and written questions.
- Draft/published/archived exam lifecycle.
- Timed attempts with autosaved answers.
- Camera + microphone presence requirement during active attempts.
- Browser visibility monitoring with a server-side three-strike disqualification rule.
- In-browser MediaPipe face-count monitoring: sustained no-face or multiple-face conditions trigger warnings, with a server-authoritative four-warning disqualification rule.
- MediaPipe EfficientDet-Lite0 mobile-phone detection, sampled on-device and confirmed across three positive frames; likely phone sightings are logged for human review, not automatic disqualification.
- Admin-only /admin/monitor page auto-refreshes active exam states and potential phone events every 15 seconds (metadata only; no livestreaming).
- Idempotent queued proctoring events to reduce event loss during brief connection failures.
- Automatic single-choice scoring without exposing answer keys to students.
- Administrator review and manual scoring of written answers.
- Candidate, attempt, and proctor-event dashboards.
- Privacy Policy and Terms starter pages.
- No camera/microphone recording or upload; face detection runs against the live camera locally in the browser.

## Stack

- Node.js 22+
- Next.js 16.3.8 / React 19.3.0
- Supabase JS 2.117.2 / `@supabase/ssr` 0.12.7
- Supabase Postgres/Auth
- Vercel

## Environment

Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.

## Supabase Auth configuration

For email-confirmation signups with SSR, set the Supabase **Site URL** to your deployed app URL and update the **Confirm signup** email template link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

The app includes `/auth/confirm` to verify the token hash and establish the cookie-backed session. Add localhost and each Vercel preview/production URL you intentionally use to Supabase's allowed redirect URLs.

## Database

Apply every SQL file in `supabase/migrations/` to a fresh Supabase project in numeric order. The migrations:

- explicitly grants Data API access to authenticated users,
- enables RLS on every public table,
- keeps correct answer keys inaccessible to students,
- adds database-side scoring and proctoring disqualification rules,
- creates an atomic admin RPC for exam creation,
- limits student question access and answer writes to the active attempt window plus a two-minute recovery/synchronization grace period.

After migration, run Supabase security and performance advisors.

## First admin

1. Sign up normally in the app.
2. Promote the intended account once using the Supabase SQL editor or a trusted administrative process:

```sql
update public.profiles
set role = 'admin'
where id = '<AUTH_USER_UUID>';
```

Do not implement self-service admin promotion.

## Local development

```bash
npm install
npm run typecheck
npm run dev
```

Commit the generated `package-lock.json` before production deployment.

## Vercel

Set the two public Supabase environment variables in Development, Preview, and Production. Deploy the repository as a Next.js project.

## Phone monitoring rollout (feature branch)

Do not merge this branch or deploy to production until the DB migration `supabase/migrations/20261014125100_phone_monitor_events.sql` is applied to the intended environment. The new event types `phone_detected` and `phone_monitor_error` are required by the API and database. No change is made to existing face-warning disqualification logic.

The model is loaded on demand from the official Google MediaPipe-hosted EfficientDet-Lite0 COCO checkpoint. It may need several seconds and roughly 14 MB of model download, and detection can be slow on phones/tablets. Face monitoring, autosave and submission remain functional even if phone detection fails. A confirmed possible sighting requires at least three phone-class positives at 55% or higher confidence within eight seconds. A continuous sighting generates only one flag, with a 60-second minimum cooldown after it clears. The browser does not upload camera frames or audio.

Run `npm run typecheck`, `npm run build`, and `node --experimental-strip-types --test tests/phoneDetection.test.mjs` during review. Manually test webcams on multiple supported devices, offline/reconnect, low light, and misleading phone-like objects. Check `/admin/monitor` and per-attempt reviews as admin. Have a human review all flags before applying any action. Review Privacy and Terms text before rollout.

## Important proctoring limitation

A normal web application can detect browser signals such as `visibilitychange` and can estimate visible face counts from a webcam, but neither signal can prove misconduct. Face detection can be affected by lighting, occlusion, camera framing, model error, photographs, or people outside the camera view. The application also cannot guarantee that a candidate never uses another device, disables JavaScript, modifies a browser, uses virtual devices, or circumvents client-side controls. Treat proctoring events as exam-integrity signals and provide an appropriate review or appeal process for high-stakes examinations.

## Legal review

`/privacy` and `/terms` are implementation-oriented starter text, not jurisdiction-specific legal advice. Add the operating entity, retention periods, lawful basis/consent language, appeal process, accommodation process, and jurisdiction-specific notices before production use.

### Editing an exam

Administrators can open **Admin → Exam management → Edit exam** or **Students & slots → Edit exam & questions**. The editor can update the title, description, duration, exam window, MCQ and written questions, option text, correct choices, marks, question order, and private evaluator guidance. Saves are atomic and validate both MCQ answer keys and compatibility with existing slots. Exams become read-only once any student has started an attempt, preserving questions, grades, and student evidence; create a new exam for a revised version.

## Canonical production domain

The official production site is **https://btfexamcore.vercel.app**.
The previous `examapp-seven.vercel.app` URL and legacy production aliases redirect (308) to the new hostname, preserving request paths and query strings. All student account invitations, OTP reminders, and administrator-issued password recovery emails use the canonical domain. Preview deployments are not redirected.

In **Supabase Dashboard → Authentication → URL Configuration**, set **Site URL** to `https://btfexamcore.vercel.app`. Add `https://btfexamcore.vercel.app/auth/recovery` and `https://btfexamcore.vercel.app/auth/confirm` to the allowed redirect URL list if your hosted Auth workflows use them; retain necessary legacy redirect URLs temporarily for pre-existing email links. This hosted Auth setting is managed in the Supabase dashboard and is not changed by database migrations or Vercel deployments.

The student onboarding, verification, and administrator password-reset notifications are sent by the Supabase Edge Functions `admin-create-student`, `student-email-verification`, and `admin-send-password-reset`; deploy these functions as well as the Next.js application when changing the domain. SMTP credentials remain in Supabase Vault and must never be stored in this repository.
