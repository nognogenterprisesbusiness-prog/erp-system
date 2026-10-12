# Inventory simplification release

The request catalog includes active consumables, including materials with no stock, across the selected project's linked warehouses. Mobile staff enter materials and quantities without selecting a warehouse or required date. The database sets today’s Philippine date. Admin or assigned Warehouse Staff selects one linked source warehouse on request details before Engineer/Admin approval reserves stock. Source changes are audited and blocked after approval. Admin assigns a warehouse to shortages before purchasing. Installed clients that still supply warehouse/date remain supported. Selecting an unavailable catalog material opens a sourcing report with its identity; a free-text sourcing report never creates a catalog item or stock.

Site Inventory lists only positive available stock, filtered before counting and pagination. Approval reserves warehouse stock; dispatch deducts it; accepted receipt adds site stock; recorded consumption deducts site stock and charges the project. Partial deliveries remain outstanding. Site-purchase approval posts once; payment and reimbursement do not add stock.

Mobile Stock Movements shows In/Out, dates, references, other locations and supplier quantities derived from existing batch allocations. Mixed sources are listed individually. Older stock without provenance is labelled unavailable rather than assigned an invented supplier. The response contains no prices or costs. The existing mobile materials endpoint and history fields remain compatible with installed clients.

Web movement forms use the existing custom selectors and a paged material search that rejects stale results and retains selected units. Stock in/out, transfers and returns obtain a generated reference and Philippine posting date from the database. Preparing the command separately preserves both across failed posts and midnight retries. Supplier receipts, transport references and usage dates retain their existing meaning.

## Apply migrations in order

1. `20261012100000_mobile_stock_catalog.sql`
2. `20261012110000_web_movement_references.sql`
3. `20261012120000_retire_opening_setup.sql`
4. `20261012130000_request_warehouse_assignment.sql`
5. `20261012140000_purchase_order_overview.sql`

Apply these and deploy the matching web/API before distributing the new mobile build. Web push is deliberately held at the user’s request. The new app cannot use the new catalog/submission endpoints against an older API. Hosted migration application is manual and has not been performed by this change.

The third migration removes only opening-value setup objects and repair commands. It locks the check/drop boundary and aborts if stock or transit is unvalued, balance/valuation quantities disagree, batch totals disagree, or setup dependencies remain. Its error reports reconciliation counts. Investigate the documented legacy quantities and costs, reconcile them before retrying, and retain a database backup. Do not replace missing costs with zero or bypass the guards. Balances, valuations, cost layers, allocations, ledger history, audit records and posted project costs are retained.

Purchasing now shows one row per purchase order or site purchase. Opening the number displays all its items together. Search matches any item but retains the full order total; pagination counts orders. The legacy line-list RPC remains available for compatibility.

## Verification

- `npm run test:request-assignment`: source-later submissions, assignment and approval permissions, concurrent retries, midnight date retention, catalog shortage identity and grouped purchase search.
- `npm run test:stock-simplification`: 10 isolated PostgreSQL checks covering cleanup rejection/preservation, positive-stock pagination, catalog search, cross-site and unlinked-warehouse denial, identity-bound shortage retries, simultaneous posting retries, failed-save references, Manila date retention, transfers/returns and mixed-source consumption/reversal without prices.
- `npm run test:erp-workflow`: five-role workflow, concurrent reservations/releases, partial receipts, once-only site purchase approval, costing and financial reconciliation.
- `npm run test:batch-costing`: newest-batch costing, carried stock, partial transit, reversals and valuation reconciliation.
- `npm run test:all`, `npm run test:migrations`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Mobile: `npm run typecheck`, `npm run lint`, `npm test`, `npm run export:native`.

An EAS production build verifies compilation and signing, not physical-device acceptance. After deployment and migrations, test the Engineer and Foreman flows on the released app, including reconnects, custom controls, receipt upload, partial delivery and consumption. Minimum-build settings remain a separate release decision.

## Dependency audit

The mobile lockfile currently reports upstream Expo/React Native dependency advisories (29 total, 18 high). Suggested npm fixes include incompatible downgrades/SDK changes; no forced package migration was performed in this workflow change. These advisories need separate version-compatible review before a security-complete turnover claim. Unit and native build results do not establish zero vulnerabilities.
