# Web-first implementation status — 2026-09-24

This is source-code progress, not production acceptance. Android/iOS applications and cross-device synchronization remain out of scope. No connected Supabase instance or local Docker PostgreSQL engine was available; the user chose static checks for now. All new migrations remain unapplied. Do not use this checkout for live stock, approvals or financial posting until database/RLS/concurrency and authenticated browser tests pass.

## Added in this continuation

- Material-request approval now reserves warehouse stock atomically. The assigned warehouse dispatch path consumes that reservation; cancellation before dispatch releases it. Reservation events and an idempotent cancellation receipt preserve history. Direct stock-out continues to use unreserved availability.
- Low-stock balance changes and hourly reconciliation open/resolve location-specific alerts and enqueue notifications. Material-request submission, decisions, cancellation and dispatch, and daily-report submissions/reviews enqueue business notifications through the existing outbox.
- The web QR scanner accepts camera QR codes with a native-detector/fallback path and manual entry, resolves codes through the permission-scoped server lookup, and prefills authorized inventory/equipment workflows.
- Audit inspection displays changed fields before/after. Role grants/removals are audited. Sensitive contact fields are excluded from newly captured snapshots; old preexisting snapshots have not been rewritten.
- The project cost page exports the provisional contract-value management report as PDF or XLSX for authorized finance viewers. It is **not** recognized-revenue project P&L or a tax/accounting statement.
- Daily reports have independent project-manager review, approval, return-for-correction, preparer reopening, review notes and history. An approved report can now carry a dated progress entry; material, attendance and equipment evidence remain separate posted records.
- The equipment request queue has an overdue checked-out filter and visual warning. This does not yet automate late-return escalation or maintenance tracking.
- Project managers/admins can save a site-and-warehouse material plan. The project page calculates posted use, site on-hand, open requests, warehouse available quantity and a procurement shortage; request and PO forms receive validated prefill values. Planning does not reserve or mutate stock.
- An administrator or assigned project manager can record one dated progress entry against an approved daily report. The project timeline links each milestone back to its report.
- Assigned site staff/warehouse staff can submit physical counts. Only an administrator can approve a non-surplus count; a shortage posts a costed stock-out in the same database transaction, after checking the captured quantity, reservation and value snapshots. Surpluses require a separately valued receipt.
- The finance page and PDF/XLSX export now show provisional estimated gross project profit as contract value minus posted costs, including approved site stock losses and project-delivery transfer variances. Invoices, cash and receivables remain separate. This is not formal revenue recognition.

## Static verification completed

- TypeScript typecheck, ESLint, production Next.js build, request/inventory/daily-report/audit unit tests and `git diff --check` pass.
- Every SQL migration parses successfully with a PostgreSQL parser. Parsing does not prove relation/function resolution, RLS behavior or transaction correctness.
- `npm audit --audit-level=moderate` reports zero known dependency vulnerabilities after selecting the export packages.

## In-scope web work still to verify or complete

1. Execute and verify the new material-plan, progress, count and profitability migrations in an isolated database. Static SQL parsing and a web build do not validate their RLS or transaction behavior.
2. Equipment service/availability and usage-hour reporting; daily-report links to posted materials, attendance and equipment use without double-posting. Progress is now linked to the approved daily report.
3. Decide whether approved contract change orders or corporate overhead should affect estimated gross profit; the current report uses the project contract field and posted direct costs only.
4. The isolated local demo now previews an editable project material plan and request prefill, but still does not mirror connected count, profitability, PO/receipt, billing, labor-rate or equipment-usage postings.
5. Role-by-role browser UAT, opening-value reconciliation, backup/restore rehearsal and production deployment readiness.

Supplier credits, purchase-invoice/PO matching, landed-cost tax allocation, configurable multi-level approvals, a general ledger and formal revenue recognition are not assumed in the quoted web scope. Add them only after separate sign-off.

## Next validation gate

Apply the **entire ordered migration chain** to a disposable staging Supabase project or local PostgreSQL, then run `npm run test:material-reservations` plus the existing SQL/concurrency suites. Review the authorization and value-conservation assertions before adding more posting workflows. Never point these unapplied migrations at production as a substitute for staging.

For the 2026-09-25 additions, also verify: manager vs unrelated-project plan writes; two sites and two warehouses with the same SKU; submitted, reserved, in-transit, partially received and variance-resolved requests in shortage calculations; progress only on an approved report and duplicate/concurrent retry behavior; staff-count versus admin-decision role denials; a count becoming stale after any quantity, reservation or value change; a loss larger than unreserved stock; duplicate approval; site write-off cost once, its reversal excluded from profitability; warehouse write-off excluded from project cost; and PDF/XLSX matching the authorized numeric RPC. Browser-check the request/PO prefill and mobile-width tables. The demo does not prove any of these connected behaviors.
