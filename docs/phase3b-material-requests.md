# Phase 3B — connected material request intake and decision

This slice lets an active assigned engineer/foreman/project manager (or administrator) submit one request with up to 20 distinct material SKUs for one active project, site and linked warehouse. An assigned project manager or administrator records full, partial or zero approval per line. The reason is required for any reduction or rejection. Requests, lines, decisions and actor history are durable; submission and decision use idempotency keys. Approval does not reserve, release, receive or consume stock.

Direct `post_stock_out` is now an administrator-only exception with a mandatory audit reason. This is a security/business-rule change to the existing stock-out screen and RPC. The subsequent [Phase 3C slice](./phase3c-request-fulfillment.md) adds a scoped warehouse queue and request-bound dispatch/receipt without granting broad project-record access to warehouse staff. Both migrations remain unapplied pending isolated staging verification.

The client selected manager approval, admin-only unlinked exceptions, and weighted-average cost at site consumption. The live cost method is **not** implemented by this migration. It requires costed stock-in/opening balances, value-preserving transfers/returns/reversals, quantity/value locking, a cost snapshot on posted consumption, and reconciliation tests. Do not show the demo's illustrative cost as live accounting data.

For opening balances, the client delegated the choice: require an administrator to record and verify quantity **and total value** for each SKU at each warehouse before valuation begins. Zero cost and current supplier quotes are not acceptable stand-ins for missing historical value. Do not calculate project profit from an unvalued stock position.

## Staging gate (not yet run)

No staging Supabase project is available and local Docker is not running, so migration `20260924180000_material_request_intake.sql` and its Phase 3C successor are intentionally unapplied. Before live use, apply all ordered migrations to an isolated staging project and prove:

1. Admin, assigned project manager, engineer and foreman can submit only for active assigned projects/sites and linked active warehouses; inactive users, unrelated projects and roles are denied by RPC and direct Data API.
2. Only assigned project manager or administrator can decide; warehouse staff, accounting, unrelated managers and requester without manager authority cannot decide.
3. Duplicate submission and decision keys return the same result; reuse with changed payload fails. Concurrent decisions cannot both commit. Zero, partial, full and over-request quantities are handled correctly.
4. Client attempts to write request/line/event tables directly fail. RLS hides requests and history for unrelated projects. Warehouse users cannot see unrelated project budgets or request details.
5. Direct stock-out by warehouse staff fails; admin direct stock-out without an audit reason fails. Existing warehouse stock-in and warehouse-to-warehouse transfer behavior remains intact.
6. Screen walkthrough at 320px, 390px and desktop; empty, invalid, retry and changed-assignment cases.

The connected Package 3 workflow is not complete until the prepared dispatch/receipt commands pass database and role gates, and actual consumption, weighted-average costing and per-project reports are implemented and verified.
