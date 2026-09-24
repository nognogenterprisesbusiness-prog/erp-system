# Phase 3D — connected inventory valuation and transit variance

Status: **coded, unapplied and not database-verified**. These migrations are deliberately left unapplied because there is no isolated staging Supabase project and the local Docker database is stopped. Passing TypeScript/domain tests does not prove the SQL, RLS or accounting behavior. Do not post live inventory or report project margin from this slice yet.

Later connected billing, procurement, attendance, equipment and opening-transit changes are tracked in `connected-web-workflows-2026-09-24.md`; this Phase 3D note describes the earlier valuation slice and is not the complete current backlog.

Apply only to a disposable staging database, in timestamp order, after Phase 3A inventory, Phase 3B requests and Phase 3C fulfillment:

1. `supabase/migrations/20260924200000_verified_inventory_valuation.sql`
2. `supabase/migrations/20260924201000_transfer_variance_approval.sql`

## Implemented boundary

- Existing positive warehouse balances start with a **missing**, never assumed-zero, total value. An administrator verifies the physical quantity and total historical value for each SKU and warehouse. The command checks the posted quantity and records the verifier, reason and idempotency key.
- New stock-in requires an administrator-entered total cost and a reference. This is **not** a purchase-order receipt: landed cost, supplier invoice matching, tax, freight and discounts are still pending.
- Source movements remove the weighted-average cost from that location inside the same transaction as the quantity movement. A fully emptied location transfers its exact remaining value to prevent rounding residue. Dispatch holds cost in transit; each site/warehouse receipt carries a cost snapshot. Once a transfer is fully reconciled, the final receipt absorbs any rounding remainder.
- Site consumption posts a material-cost snapshot to the project only when stock is used, not when it arrives at the site. The project detail shows this **material cost only**, not total expense or profit.
- An administrator-only direct warehouse stock-out remains a documented non-project exception. It cannot carry a project ID: project-tagged material must move to a site and be posted as consumption so project cost is not silently omitted.
- The valuation migration refuses legacy project-tagged warehouse stock-outs. Their history needs an audited cost reconciliation before migration rather than silently excluding it from project costs.
- An administrator can approve a documented missing/damaged-in-transit quantity. The variance is excluded from destination on-hand and stored with its cost and approver. A non-admin cannot approve it. A transfer is complete when received plus approved variance equals dispatched quantity.
- Direct writes to transaction/valuation tables remain revoked for authenticated clients. Cost columns on quantity transaction tables are not generally selectable; the project material-cost RPC checks role and project access. Unsafe stock-in and transfer-receipt reversals are blocked. A dispatch with an approved variance cannot be reversed through the generic reversal command.

## Mandatory staging checks

1. Reset a disposable database and apply all migrations and seed data. Verify function creation and grants before opening web screens. Confirm anonymous and unauthorized roles cannot call valuation/variance commands or select cost columns; verify manager/accounting project-cost access is restricted to assigned projects.
2. Compare `inventory_balances` to `inventory_valuations` for every SKU/location. Verify opening values with the real stocktake and purchase history. Existing positive **site** stock or **in-transit** stock needs a separate audited migration plan; do not enter a guessed warehouse value or bypass the gate.
3. Stock in 100 units at ₱1,000, then 100 at ₱2,000; consume or dispatch 50 and assert ₱750 cost, 150 units/₱2,250 remain. Repeat with fractional quantities and cents, including complete depletion and partial receipts. Assert conservation across source, transit, destination and approved variance; assert historical consumption snapshots do not change after later purchases.
4. Race two consumers against the same site balance, two receivers against the same transfer item, and an admin variance against a receiver. No negative stock, over-receipt, duplicate charge or unvalued movement may commit. Same idempotency key/payload returns the original result; changed payload fails without side effects.
5. Check request-bound and general transfers through dispatch, partial receipt, approved loss, final receipt and retries. Unassigned warehouse staff, unrelated project users, foremen on other projects and anonymous clients must not see or mutate restricted records. Rejected/failed commands must roll back both quantity and value.
6. Attempt stock-in reversal after consumption, transfer-receipt reversal, request-bound generic reversal, and dispatch reversal after variance. They must fail without changing balances, valuation or history. Validate audit entries for opening verification, variance approval, movements and receipt-cost reconciliation.
7. Exercise the connected forms at desktop and narrow mobile widths with real accounts, loading/empty/error states, invalid values, stale form submissions, project reassignment and archived locations. Reconcile project material-cost totals to the immutable consumption transactions.

## Still outside this slice

Purchase orders/procurement and PO-linked receipts; inventory returns, damaged-on-hand and retrospective corrections; attendance, labor and equipment usage costing; project budgets and other expenses; invoices with partial payments; profitability/P&L and financial exports; complete mobile application. Each requires its own schema, authorized workflow and database tests. This slice alone does not satisfy Package 3 or authorize production deployment.
