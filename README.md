# RPPC OS: Phase 1 (CRM)

In-house operations platform for Red Pallet Provider Co. Phase 1 covers accounts, contacts, delivery sites, the opportunity pipeline, activities (offline-capable), follow-up tasks, client-concern tickets with SLA, attachments, the audit log, user management, and CSV import/export.

Stack: Next.js 16 (App Router, TypeScript) + Supabase (Postgres, Auth, Storage) on Vercel.

## Layout

| Path | What |
|---|---|
| `supabase/migrations/0001…0009` | Database schema, Row Level Security, triggers, storage bucket, scheduled jobs. Already applied to the `rppc-os` Supabase project. |
| `supabase/tests/rls.test.sql` | Permission-matrix test suite (47 checks). Runs in one transaction and rolls back; the final error message reports `PASS: n FAIL: 0`. |
| `src/proxy.ts` | Session refresh, route guard, idle (30 min, desktop) and absolute (12 h) session limits, forced password change. |
| `src/lib/auth/permissions.ts` | Role → action map used by the UI (the database RLS is the real authority). |
| `src/lib/offline/` | IndexedDB outbox + sync loop (activities, tickets, ticket comments, tasks). |
| `public/sw.js` | Service worker: offline app shell. |
| `tests/unit` | Vitest unit tests. |
| `tests/e2e/smoke.mjs` | Playwright end-to-end smoke suite (17 checks). |

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Set. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key. Set. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required, add it yourself.** Supabase → Project Settings → API keys → secret key. Server-only; never prefix with `NEXT_PUBLIC_`. Needed to create users and verify uploads. |
| `SETUP_TOKEN` | One-time token for `/setup`. Set. Delete after the first owner exists. |
| `REQUIRE_MFA_ROLES` | Optional, e.g. `owner,admin,finance`. Shown in Settings; enforcement is planned. |
| `APP_TIMEZONE` | `Asia/Manila`. |

## First-time setup

1. Add `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy.
2. Open `https://<your-domain>/setup?token=<SETUP_TOKEN>` and create the owner account. The page disables itself once an owner exists.
3. In Supabase → Authentication: disable public sign-ups, set minimum password length to 12, and (on paid plans) turn on leaked-password protection.
4. Sign in → **Users** → add staff. Each gets a temporary password and must change it at first sign-in.
5. **Import** existing clients: run a dry run first, then import.

## Development

```bash
npm install
```

```bash
cp .env.example .env.local   # fill in URL + publishable key (+ service key for admin features)
```

```bash
npm run dev
```

Checks:

```bash
npm run typecheck
```

```bash
npm test
```

End-to-end (needs a running app and `e2e-*@rppc-e2e.test` users; delete them afterwards):

```bash
BASE_URL=http://localhost:3000 E2E_PASSWORD=... node tests/e2e/smoke.mjs
```

## Changes from the spec

- Staff are created by an admin with a temporary password instead of an email invite (Supabase's built-in email only reaches project members).
- Uploads go browser → private bucket, then the server checks magic bytes and size and registers the file (Vercel caps function bodies at 4.5 MB).
- Database also enforces: ops managers may change accreditation/billing cutoff only; only sales management archives or reassigns; users cannot clear their own `must_change_password`; ticket SLA fields are system-managed.
- Exports are CSV only (Excel opens them).
- Idle and absolute session limits are enforced in `src/proxy.ts`.
