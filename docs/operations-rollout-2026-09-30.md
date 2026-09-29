# Operations rollout and QA gate — 2026-09-30

## User workflow

- Foreman or Engineer selects a project, site and linked warehouse, requests material currently available there, or reports a missing item to Admin. A report cannot create a catalog SKU or stock balance.
- Admin can catalog and purchase the missing item, receive it into the source warehouse, then resolve the report. Existing request approval still reserves stock atomically.
- Warehouse Staff or Admin releases an approved request with a vehicle/transport, driver and delivery reference. Authorized site staff sees those details and records received quantity and an acceptance note. The existing stock dispatch and receipt commands remain authoritative.
- Admin can invite Finance. Finance can inspect costs and billing, issue invoices and record payments. Admin retains budget/rate edits, payment reversals and invoice voids.
- Inventory has Materials, Equipment and Vehicles views. Material balances and asset custody remain separate ledgers. Equipment-use entries on web or mobile require start and after photos.

## Migration and backup plan

1. Take a verified database backup and record a restore point; capture the applied `supabase_migrations.schema_migrations` versions and Storage bucket settings. Do this first on an isolated Supabase project with disposable data.
2. Apply these migrations in order: `20260930100000_finance_role_enum.sql`, `20260930101000_finance_permissions.sql`, `20260930102000_requestable_warehouse_stock.sql`, `20260930103000_material_sourcing_requests.sql`, `20260930104000_material_delivery_checks.sql`, `20260930105000_equipment_usage_evidence.sql`. The enum migration must commit before functions reference the new enum value.
   If a manual SQL Editor run stopped partway through, use the current files and rerun each file separately in that order. These files now tolerate their own already-created tables, indexes, policies, triggers, columns and functions. Run the enum file as its own query so PostgreSQL commits the enum label before the Finance functions reference it. Do not rerun an older copy of the SQL.
3. Verify table grants, policies, function execution, Storage access and data shape using Admin, Finance, Engineer, Foreman, Warehouse Staff and anonymous sessions. Reject cross-project/site/warehouse reads and writes. Verify Finance cannot procure, alter rates/budgets, reverse payments or void invoices.
4. Exercise duplicate and changed-payload retries, simultaneous release against limited stock, partial dispatch/receipt, transport details, recipient and quality notes, stock-card quantity/value reconciliation, site consumption and project cost once-only posting. Verify current weighted-average stock cost is not repriced by a newer supplier quote.
5. On web, walk through stock-only search, missing-material reporting/resolution, inventory tabs, billing and two-photo use. On Android/iOS, walk through the same warehouse picker, shortage report and equipment photo save, including failed upload followed by retry. Confirm old client versions receive a clear photo-required error for equipment use.
6. Only after the isolated pass and approval, schedule a backed-up production migration before deploying either client. Monitor database errors and posted records after release. If validation fails, stop client rollout and restore from the verified backup according to the database recovery procedure; do not try to reverse posted stock or billing by deleting rows.

## Verification at code level

`npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:all` and `npm run test:migrations` are the web gates. The companion gates are `npm run typecheck`, `npm run lint`, `npm run test` and `npm run export:native`. Passing these does not establish SQL behavior. The SQL parser validates syntax only; no database migration or authenticated end-to-end transaction was run during this change.

## Cost decision

The current ledger uses moving weighted-average stock value, and supplier prices dated to new purchase orders. The client has not chosen a different stock valuation method. Changing historical stock to the latest supplier quote would alter past valuation and requires a separate signed decision and migration.
