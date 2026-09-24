# Phase 3C — request-bound dispatch and site receipt (unapplied)

Continuation: the later, still-unapplied valuation and administrator variance design is documented in `docs/phase3d-valuation-variance.md`. The limitations below describe Phase 3C alone, not the current combined source tree.

The approved request queue shows only lines from warehouses assigned to the signed-in warehouse worker (or all lines to an administrator). It exposes limited project/site/SKU identification and remaining approved and available quantities, not project budgets. Dispatch posts a source decrement, in-transit transfer, request link and event in one database transaction. A project-assigned manager, engineer or foreman (or administrator) confirms physical site receipts. Partial receipts increase site on-hand only by the confirmed quantity. The remainder stays in transit; it is **not** written off or added to project cost.

The client confirmed that an administrator must approve missing/damaged-in-transit variances. This slice intentionally has no variance resolution command: shortages remain open until that workflow exists. Generic transfer receipt and reversal reject request-bound transfers so that their fulfillment totals cannot silently diverge. Direct warehouse-to-site dispatch outside a request is an administrator-only exception with a mandatory reason.

Migration: `supabase/migrations/20260924190000_request_fulfillment.sql`. It depends on the Phase 3A inventory and Phase 3B request migrations. No staging project exists and local Docker is stopped, so this SQL is not applied or database-tested. Passing TypeScript checks is **not** evidence that these SQL functions work in PostgreSQL.

## Required staging checks before live use

1. Apply all migrations in order to an isolated, disposable staging database; verify RPC creation, grants, RLS, table constraints and rollback behavior. Do not apply directly to production.
2. Assigned warehouse staff see and dispatch only their warehouse's approved lines; unassigned staff, unrelated project users and anonymous clients cannot dispatch or query restricted project data. Admin sees all. Manager approval cannot release stock by itself.
3. Concurrent dispatches against one approved line and source balance cannot over-release or make available stock negative. Duplicate same-payload keys return the original transfer; different-payload key reuse fails without side effects.
4. Project-assigned receiving roles can confirm partial quantities, never above outstanding in-transit quantity; unrelated users fail. Destination balance rises only after confirmation; source stock decreases once at dispatch. Retry/conflict tests leave one event per committed movement.
5. Generic receipt, generic reversal and direct table writes cannot bypass request links/events. Unlinked site transfers fail for warehouse staff and require an admin reason. Existing warehouse-to-warehouse transfers continue to work.
6. Verify queue/detail/transfers at 320px, 390px and desktop with real role accounts, no stock, full receipt, partial receipt, assignment revocation, inactive project/site/warehouse, invalid date and stale form state.

## Next accounting gate

Before exposing project material cost or profit, reconcile administrator-entered opening quantity **and total value per SKU per warehouse**, implement value-preserving transfers/returns, weighted-average cost at site consumption, immutable cost snapshots, and admin-approved transit variance adjustments. Add actual SQL/RLS/concurrency tests for these invariants. Client billing will use invoices with partial payment allocations, but belongs to the later finance slice after inventory valuation is trustworthy.
