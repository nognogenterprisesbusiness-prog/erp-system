# Connected web workflow continuation — coded, unapplied

This is implementation status, **not production acceptance**. The user has no isolated staging Supabase project and the local Docker PostgreSQL engine is stopped. No new migration was applied to a database. TypeScript, lint, domain tests and the Next build cannot prove SQL creation, RLS, concurrency, role denial or value conservation. A later local checkpoint commit recorded the pre-continuation worktree; current continuation changes remain uncommitted.

## Connected paths added

| Path | Posted records and rule | Web entry |
| --- | --- | --- |
| Client billing | Project-contract-capped issued invoices; partial payments cannot exceed an invoice balance; admin void/reversal records preserve originals; idempotency and invoice row locks serialize retries/payments. | `/billing` |
| Procurement | Admin issues a multi-line PO using effective PHP supplier-price snapshots. Admin posts partial line receipts with actual goods cost to the shared valued stock-in routine; mismatched cost requires a reason. Cancellation is limited to unreceived orders. | `/purchase-orders` |
| Unused site stock | Admin dispatches a documented site-to-warehouse return; warehouse receipt preserves the same transfer value and does not post project consumption cost. | `/inventory/transfers?siteReturn=1` |
| Attendance | Admin posts present/absent employee days against valid assignments. Hourly cost uses hours; daily cost uses an explicitly entered paid-day fraction. Rates and cost are snapshotted, total employee hours are capped at 24/day, and corrections are append-only reversals. | `/projects/[id]/attendance` |
| Equipment | Admin sets a versioned hourly management charge and posts project-site equipment hours with a historical rate snapshot; duplicate project/day and >24-hour postings are blocked; corrections are reversals. | `/projects/[id]/costs` |
| Budget and other cost | Admin posts immutable budget deltas and external permit/subcontract/utility/other expenses. Original project budget is frozen after draft; corrections to costs preserve the original record. | `/projects/[id]/costs` |
| Management summary | Material consumption net of reversal, labor, equipment, other costs, issued invoice value, and net client payments are totaled. “Billed margin” = issued invoices − these posted costs. It is **not** recognized-revenue P&L or a tax report. | `/projects/[id]/costs` |
| Opening values | Admin can verify actual warehouse/site quantity plus historical total value and separately reconcile legacy in-transit dispatch/received value with a supporting reference. No values are generated automatically. | `/inventory/opening-values` |
| Warehouse retirement | Admin may rename/edit an existing warehouse without changing its ID. Marking it inactive is rejected while physical/valued stock, an in-flight transfer, or an open PO remains. New stock, transfer, and PO writes serialize with retirement and require an active warehouse. History is retained; there is no connected hard-delete action. | `/warehouses/[id]/edit` |

The migrations are `20260924200000` through `20260924215000` in timestamp order. Several earlier Phase 3 migrations were refined to make returns valued and to share the valued stock-in primitive. The warehouse-retirement migration refuses to apply if an already-inactive warehouse holds stock or has unfinished transfers/POs; reconcile that data first. Do not apply only the latest file; reset a disposable staging database and apply the full ordered set.

## Required staging tests before release

1. Apply all migrations to an isolated empty/staged database and lint the resulting schema. Verify every function signature, trigger, FK, check, grant and RLS policy. Run admin, accounting, project manager, foreman, warehouse staff, unrelated user and anonymous denial tests.
2. Reconcile every real SKU/location to physical quantity and documented total value. For legacy transit, reconcile source on-hand + in-transit + already received quantities/values to historical records before verifying. Refuse unknown values; never use a supplier quote as an opening value.
3. Race two PO receipts against one remaining line, two payments against one outstanding invoice, two attendance/usage postings on one worker/asset/day, and two stock returns from one site balance. Assert no over-receipt, overpayment, >24 hours, negative stock or duplicate cost; same key/payload must return the original result, changed payload must fail.
4. Validate weighted-average math through PO receipt → warehouse dispatch → site receipt → consumption → unused return and variance. Check ledger, balance, in-transit and valuation conservation after partial receipts, reversals and cents rounding.
5. Verify invoice void after payments is denied; reversing a payment restores outstanding without deleting history. Verify PO price changes and worker/equipment rate changes never alter posted snapshots. Check financial aggregates after each reversal.
6. Exercise the connected forms on desktop and narrow mobile widths with real accounts and valid/invalid data. Review audit log entries, error/empty states, backups, restore, export authorization and secrets before deployment.
7. With real admin/staff accounts, verify warehouse rename preserves links and audit history; zero-stock/closed-transfer/closed-PO retirement succeeds; stock, valued stock, each unfinished transfer direction, and an open PO each block retirement. Race retirement against stock-in, transfer creation, and PO issue. Verify inactive warehouses reject new positive stock, transfer endpoints, and PO issue; ordinary staff cannot change status.

## Business rules still needing sign-off

- The current PO receipt accepts an **explicit actual goods cost**. Allocation of freight, VAT, discounts or supplier credits is not part of the quoted web scope without separate sign-off.
- Whether the equipment hourly charge represents rental, fuel/maintenance or depreciation, so other expenses cannot double count it.
- What qualifies as a full/partial paid day and whether overtime, absences, benefits or payroll charges belong in project labor cost. Current posting requires an explicit day fraction and is **not payroll**.
- Agree the Package 3 management project-profit calculation. The current billed-margin view is a comparison only, not project profit. Formal revenue recognition, taxes, retention, supplier credit notes and purchase-invoice matching need separate sign-off.
- Agree a controlled damaged/lost stock correction if it occurs in normal operations. Site-to-warehouse returns are implemented; supplier returns/credits need separate sign-off.

Until the in-scope cost/report rules, real opening data and staging tests are complete, the release decision remains **NO-GO** for connected production use. Optional accounting extensions above are not automatic release blockers. The local demo remains UI preview and does not prove live workflow parity.
