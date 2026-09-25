# Web release readiness — 2026-09-24

**Later source update:** See [web-first implementation status](./web-first-implementation-status-2026-09-24.md) for reservation, QR, low-stock notifications, audit inspection, daily-report review, project planning/progress, stock counts, profitability, exports and overdue-request visibility. These additions remain unapplied and do not change the NO-GO decision below.

**Decision: NO-GO for a connected production ERP deployment.** The responsive local demo is suitable for UI review, not for live accounting or operational stock posting. A passing Next.js build does not validate PostgreSQL commands, Supabase RLS, authenticated workflows or Package 3 completeness.

## Verified in this checkout

- TypeScript typecheck, ESLint, production Next.js build and all available demo/auth/media/search/request/inventory-domain unit tests pass.
- `npm audit --omit=dev --audit-level=high` reports zero known production-dependency vulnerabilities at the time of this check; this does not replace application security testing.
- Browser walkthrough at 390px and desktop confirms 14px settings labels/account picker, 14px profile name with 12px role, independent dashboard panel heights, no horizontal overflow on the tested dashboard, and legible light/dark dashboard contrast.
- The daily-report start/end filter was checked in the local demo at desktop and 390px. The end-date calendar stays within the viewport and the inclusive range changes the visible rows. The connected page uses the same picker, but still needs authenticated staging verification.

## Release blockers, in order

1. **Database execution and access control:** no isolated staging Supabase project exists, and local Docker/PostgreSQL is stopped. Ordered migrations, RLS/Storage grants, SQL functions, retries, concurrency and role-denial behavior have not been run. Keep all new migrations unapplied until an isolated database and rollback plan are available. Follow `docs/phase3c-request-fulfillment.md` and `docs/phase3d-valuation-variance.md`.
2. **Unverified connected Package 3 workflows:** PO issue/partial receipt, site-stock return, attendance cost, equipment request/approval/checkout/return, equipment usage, other expenses, budget changes, invoices/partial payments, material plans, report-linked progress, approved stock-count shortages and provisional management profitability are coded as unapplied migrations and web screens. They have not passed database, RLS, concurrency or real-account tests, so they are **not delivered production workflows**. The local demo does not yet preview the new plan/count/profit postings. See `docs/connected-web-workflows-2026-09-24.md` and `docs/web-first-implementation-status-2026-09-24.md`.
3. **Opening data and cost/report definitions:** admin entry for warehouse/site opening values and legacy in-transit costs is coded, but no real quantity, cost or evidence was supplied or reconciled. Confirm the equipment charge-rate basis, labor paid-day rule and project-profit definition with representative client data. Do not enter guessed opening values or present billed margin as project profit. Supplier credits, purchase-invoice matching, freight/VAT allocation and formal accounting revenue recognition are separate enhancements unless signed off.
4. **Operations and recovery:** production configuration, secrets ownership, backup/restore rehearsal, monitoring/error reporting, scheduled notification processing and retention policy are not verified. Complete real-account web UAT and a restore drill before release.
5. **Release source delivery:** this checkout has no Git remote. A local checkpoint commit now records the pre-continuation worktree, but the current implementation remains uncommitted and unapplied. A Git-based deployment cannot be assumed to contain it until the changes are reviewed, committed and pushed to an approved remote.

## Next safe gate

Provision a disposable isolated Supabase staging project; apply the versioned migrations there in order, then exercise role/RLS denials, concurrent inventory postings, idempotent retries, value conservation and authenticated browser flows. Continue the remaining Package 3 modules as separately testable vertical slices. Do not point this checkout at production credentials to substitute for staging.
