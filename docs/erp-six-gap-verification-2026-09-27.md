# Six-gap implementation and acceptance record

Status: implementation in progress, not operationally accepted. No hosted database changes or deployment were performed. Preserve the four roles, existing material approvals, modal attendance entry, Cards/Table selection and cached navigation. Native apps, payroll expansion and new approval queues are excluded.

## Implementation

1. New material forms and database writes accept consumables only. Reusable tools belong in the existing Equipment registry/handover workflow. Existing reusable material rows cannot be edited, converted or posted; their history and balances remain intact. Admin must reconcile them deliberately before creating any corresponding equipment record.
2. Assigned Foremen and Admin can post attendance without approval. The command keeps atomic historical rate/cost snapshots, retry keys, duplicate prevention and employee-level locking for the 24-hour limit. Daily entry accepts full/half days; hourly entry costs actual hours. An ambiguous effective rate requires an Admin-maintained costing basis. Foremen cannot configure basis/rates or reverse attendance. Their operational RPC returns no wage/cost fields. Saves no longer redirect. Project assignment is the existing authorization boundary; employee assignment carries and validates the site relationship.
3. Reports attach existing consumption/attendance/equipment postings through typed foreign keys. Project/date/known site must match. New equipment postings snapshot their site; unknown historical sites are not invented. Attachment/removal is audited, including after submission. Duplicate links are prevented. A linked report cannot change its project/date/site until links are removed. Reversed postings remain visible and excluded from displayed financial values. No linking command posts stock or costs; profitability stays authoritative in its existing ledger RPC.
4. Notification repair now has version `20260926110100`; common units retain `20260926110000`. Forward repair `20260927080000` idempotently ensures both changes exist. The migration-version validator rejects duplicate filenames.
5. Reservation/concurrency scripts use generated four-role users and random credentials. They require a local Docker socket, reject remote Supabase URLs, clone the verified local database into an exact generated test-owned database, and clean up only that clone. No company reset is performed. Concurrent release exercises an approved request line rather than direct stock-out. A new attendance/report-link integration script covers daily full/half-day and hourly costing, ambiguous basis, retries, concurrent duplicate/role/wage/cross-project denial, financial redaction, link idempotency/no double posting and Admin reversal.
6. Inventory balances filter/page in SQL; inventory export reads all matching records in server batches. Attendance, progress, project equipment/expenses/budget history, supplier events/purchases/prices, equipment/vehicle events and equipment usage have stable independent pages and counts. Stock counts have separate stock/history pages and scoped pending-count detection. Project totals remain ledger aggregates, not page sums. Material request/stock-in/site-use and attendance assignment pickers now support paginated searches and keep choices cached while their form is open.

## Verified code checks

- [x] ESLint.
- [x] TypeScript.
- [x] Production build.
- [x] 52 domain, security, navigation/cache, media, export and rendering unit tests.
- [x] Migration filename validation: 60 unique versions.
- [x] SQL statement syntax parsed for six new migrations using PostgreSQL's parser (pglast). This does not validate PL/pgSQL catalog resolution, column types, RLS, grants or execution.

## Unverified acceptance / remaining implementation

- [ ] Complete clean-database migration chain and both duplicate-version repair states.
- [ ] Hosted migration history inspection and hosted behavior. No database reset or migration-history repair is authorized by these code checks.
- [ ] Four-role end-to-end purchase → receipt → request/approval → release/receipt → consumption → labor/equipment → report → billing/payment → profitability reconciliation.
- [ ] Cross-project/site denial, Foreman wage denial, ambiguous historical rates, hourly/full-day costing, concurrent attendance/24-hour enforcement and historical fractions in a database.
- [ ] Resource-link material/equipment cases, unauthorized attachment/removal and submitted-report audit behavior in a database.
- [ ] More than 1,000 balances, complete exports, all page counts and reversed-record totals reconciled in a database.
- [ ] Finish remaining capped reference loaders and auxiliary histories: inventory location/category/unit references, supplier catalog/comparison/reference loaders, project equipment reference loader, material catalog/details, inventory transfer and opening-value queues. They are not covered by the selected pagination work above. Do not claim complete pagination yet.
- [ ] Finish the remaining integration matrix (cross-project 24-hour sums, material/equipment attachments, complete HTTP exports and full purchase-to-profitability workflow). Attendance and >1,000 SQL balance test scripts are written but unexecuted; they are not passing evidence.
- [ ] Browser walkthrough with all four roles, modal/accessibility/narrow-screen behavior and silent save refresh.

Local execution blocker: `npm run supabase:start` failed while Docker committed its overlayfs metadata (`metadata.db: input/output error`). The attendance integration script subsequently failed at container inspection with Docker's 500 server error, before creating a test database or posting any ERP records. Fix the Docker engine/storage first. No destructive cleanup of Docker volumes was attempted.

## Safe migration reconciliation

Before any hosted rollout, inspect the ledger read-only:

```sql
select version, name from supabase_migrations.schema_migrations
where version in ('20260926110000','20260926110100','20260927080000')
order by version;
```

Inspect whether both common units and notification repair are actually present. A filename collision may have recorded either original file at `20260926110000`; do not infer which from the version alone. The new notification repair and forward repair are repeat-safe, so apply the ordered unapplied migrations using the normal reviewed migration process. Do not reset a hosted database, delete ledger rows or blindly mark migrations applied. Retain the existing common-units version.

For local acceptance, start a healthy Supabase test database, apply the complete ordered chain, then run `npm run test:migrations`, `npm run test:automatic-attendance`, `npm run test:inventory-pagination`, `npm run test:material-reservations` and `npm run test:inventory-concurrency`. The latter scripts create disposable copies, but they depend on a fully migrated, seeded local database. Database acceptance remains unchecked until actual results and financial reconciliation are recorded here.

## Follow-up implementation and verification (2026-09-27)

- Equipment CSV now traverses every filtered asset page instead of exporting only 500. Transfer history has a count and stable 25-row pages. Supplier comparison and purchasing choices, report choices/history, employee categories/events/rates/assignments, project attendance assignment choices and project equipment rate lookups now traverse ordered pages rather than silently stopping at their previous caps. Project equipment choices share one site-scoped loader. This is code-level coverage, **not** a populated-database or HTTP-export acceptance result. Some material, billing and auxiliary reference paths still need a dedicated large-data audit; do not claim all lists fully paginated.
- Migration `20260927140000` rejects new attendance at a nonoperational project/site or for an inactive employee while preserving existing posted history. It also publishes RLS-selectable project attendance/cost/billing/report-link tables as Realtime invalidation sources. Cost-bearing RLS remains Admin-only; non-Admin project and attendance views also use a 90-second silent refresh to catch changes that Realtime cannot disclose safely.
- Migration `20260927150000` permits assigned Foremen to record equipment hours at an active project site through the atomic rate-snapshot RPC. The rate is selected server-side; Foremen cannot set it or reverse costs. The Foreman form does not display rates or costs. The user reports applying this and the attendance/Realtime migration; their hosted migration ledger and role-specific behavior remain unverified.
- Read-only authenticated Admin walkthrough of the hosted dashboard, projects/detail/costs/attendance, inventory/transfers/transactions, equipment, requests, attendance, suppliers, purchasing, billing, reports, audit logs, warehouses and vehicles rendered without an immediate page error. Seeded records had no posted labor/equipment/billing/request activity for a meaningful cost reconciliation. No hosted write, seed, schema change, deployment or role switch was performed.
- Local checks passed: `npm run typecheck`, `npm run lint`, `npm run test:all` (55/55), `npm run test:migrations` (62 unique versions), `npm run build`, and PostgreSQL syntax parsing of the two new SQL files. Syntax parsing does not execute triggers or resolve catalog objects. `npm run test:automatic-attendance` could not enter the isolated test database because `docker inspect supabase_db_nognog-enterprises` timed out. Thus RLS, triggers, role denial, Realtime delivery, concurrent release and financial totals remain unverified. The new migrations must be reviewed/applied to an isolated database before hosted rollout; do not run destructive fixtures against company data.
