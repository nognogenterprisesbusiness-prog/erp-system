# Web release readiness — 2026-09-24

**Decision: NO-GO for a connected production ERP deployment.** The responsive local demo is suitable for UI review, not for live accounting or operational stock posting. A passing Next.js build does not validate PostgreSQL commands, Supabase RLS, authenticated workflows or Package 3 completeness.

## Verified in this checkout

- TypeScript typecheck, ESLint, production Next.js build and all available demo/auth/media/search/request/inventory-domain unit tests pass.
- `npm audit --omit=dev --audit-level=high` reports zero known production-dependency vulnerabilities at the time of this check; this does not replace application security testing.
- Browser walkthrough at 390px and desktop confirms 14px settings labels/account picker, 14px profile name with 12px role, independent dashboard panel heights, no horizontal overflow on the tested dashboard, and legible light/dark dashboard contrast.
- The daily-report start/end filter was checked in the local demo at desktop and 390px. The end-date calendar stays within the viewport and the inclusive range changes the visible rows. The connected page uses the same picker, but still needs authenticated staging verification.

## Release blockers, in order

1. **Database execution and access control:** no isolated staging Supabase project exists, and local Docker/PostgreSQL is stopped. Ordered migrations, RLS/Storage grants, SQL functions, retries, concurrency and role-denial behavior have not been run. Keep all new migrations unapplied until an isolated database and rollback plan are available. Follow `docs/phase3c-request-fulfillment.md` and `docs/phase3d-valuation-variance.md`.
2. **Unverified connected workflows and remaining corrections:** PO issue/partial receipt, site-stock return, attendance cost, equipment request/approval/checkout/return, equipment usage, other expenses, budget changes, invoices/partial payments and management billed-margin reporting are now coded as unapplied migrations and web screens. They have not passed database, RLS, concurrency or real-account tests, so they are **not delivered production workflows**. The local demo does not yet preview the new equipment handover. Supplier returns/credits, damaged-on-hand valuation correction, purchase invoice/PO matching, and recognized-revenue P&L remain unimplemented; see `docs/connected-web-workflows-2026-09-24.md`.
3. **Opening data and finance policy:** admin entry for warehouse/site opening values and legacy in-transit costs is coded, but no real quantity, cost or evidence was supplied or reconciled. Landed freight/VAT/discount allocation, equipment charge-rate basis, labor paid-day rules and recognized-revenue/P&L definitions require client confirmation and test data. Do not enter guessed values or use management billed margin as a formal P&L.
4. **Operations and recovery:** production configuration, secrets ownership, backup/restore rehearsal, monitoring/error reporting, scheduled notification processing and retention policy are not verified. Complete real-account web UAT and a restore drill before release.
5. **Release source delivery:** this checkout has no Git remote and much of the app is untracked. A Git-based deployment cannot be assumed to contain the working app until the release is reviewed and committed. The user requested that Git history remain untouched here, so no commit or remote was created.

## Next safe gate

Provision a disposable isolated Supabase staging project; apply the versioned migrations there in order, then exercise role/RLS denials, concurrent inventory postings, idempotent retries, value conservation and authenticated browser flows. Continue the remaining Package 3 modules as separately testable vertical slices. Do not point this checkout at production credentials to substitute for staging.
