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

## Important proctoring limitation

A normal web application can detect browser signals such as `visibilitychange` and can estimate visible face counts from a webcam, but neither signal can prove misconduct. Face detection can be affected by lighting, occlusion, camera framing, model error, photographs, or people outside the camera view. The application also cannot guarantee that a candidate never uses another device, disables JavaScript, modifies a browser, uses virtual devices, or circumvents client-side controls. Treat proctoring events as exam-integrity signals and provide an appropriate review or appeal process for high-stakes examinations.

## Legal review

`/privacy` and `/terms` are implementation-oriented starter text, not jurisdiction-specific legal advice. Add the operating entity, retention periods, lawful basis/consent language, appeal process, accommodation process, and jurisdiction-specific notices before production use.
