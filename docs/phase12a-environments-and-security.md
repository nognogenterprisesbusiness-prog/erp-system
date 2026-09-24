# Phase 12A: web environment and security review

This is a limited Phase 12A web slice, not production-readiness approval. The attached Phase 12 plan's mobile and later deployment/turnover tasks are deferred by the web-first product decision. No production database, cloud project, deployment, or secret was changed.

## Environment selection

| Mode | Required configuration | Data location | Status |
|---|---|---|---|
| Local demo | `APP_MODE=local-demo`, `NEXT_PUBLIC_APP_MODE=local-demo` | This browser's IndexedDB `nognog_erp_demo` | Browser-verified locally |
| Staging | Matching `APP_MODE=staging` values plus staging URL and publishable key | Separate Supabase project | Configuration guard exists; isolated project and workflows not verified |
| Production | Matching `APP_MODE=production` values plus approved production URL and publishable key | Approved Supabase project | Not configured or verified here |

The app fails when mode is missing/mismatched and when the selected Supabase URL/key is absent. Demo uses no Supabase client, disables external effects, and is available in a live/staging deployment only if `ENABLE_LOCAL_DEMO=true`. This repository's ignored `.env.local` selects local demo for development. `.env.example` contains names and examples, not live credentials. Never put privileged database, Supabase secret/service-role, job, or email credentials behind a `NEXT_PUBLIC_` variable.

## Demo settings and media

The web Settings view shows mode, storage, and database. A snapshot is saved in IndexedDB; restore/reset/import are explicit operations. Import validates the demo schema and size and replaces records atomically. A snapshot survives reset but remains only in that browser/profile; it is not a backup of company data. Export creates a local JSON download.

The image optimizer reads PNG/JPEG locally, checks file signature and MIME, enforces input/dimension limits, redraws to a canvas, and downloads a WebP capped at 2 MB. It does **not** upload or store the image. No business attachment upload pipeline or Storage bucket currently exists, so no automatic server upload conversion was claimed. Before adding attachments, enforce server-side MIME/signature/size/dimension checks, authorization and ownership, a private Storage bucket with size/MIME limits and RLS, and metadata-only database rows. Do not store image binaries in PostgreSQL.

## Security review and verification

- Search text interpolated into PostgREST `.or(...)` expressions is now allow-listed and length-limited; location identifiers in the combined filter are parsed as UUIDs. Other database access uses Supabase query builders or fixed SQL migrations, not string-concatenated SQL. This reduces filter-grammar injection risk, but is not a proof that every endpoint is safe.
- React-rendered text is escaped by default; the source audit found no `dangerouslySetInnerHTML` or `eval` in `src`. The proxy adds `nosniff`, frame denial, referrer and permissions headers; demo has a restrictive network CSP. Generated SVG QR responses carry their own sandbox CSP. These are defense-in-depth, not a substitute for validation and output encoding at each future entry point.
- `npm run typecheck`, `npm run lint`, `npm run test:demo`, `npm run test:media`, `npm run test:security`, and `npm run build` pass. `npm audit --omit=dev --audit-level=high` reported no high-severity production dependency advisories on 2026-09-23. The settings page and snapshot save/reload were verified in the local browser.
- Local Docker/Supabase is unavailable in this workspace, so migrations, pgTAP/RLS, authenticated role-denial, concurrency, and full business workflow tests were **not** run. A real isolated staging project, production secrets, scheduled jobs, Storage policies, backup/restore, and monitoring remain unverified. The Phase 12 deployment gate stays closed.

Next small step: provision an approved isolated staging Supabase project, apply migrations there, then run database/RLS and end-to-end role/workflow tests without copying production data.
