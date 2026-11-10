# Workflow logic audit — 10 November 2026

The audit exercised the existing workflows, permissions, retries and accounting rules. No hosted stock, requests, expenses or approvals were created or changed. Database tests used disposable local PostgreSQL databases with the full migration chain and fictional seed data.

## Corrections

- Delivery completion now follows remaining reservations and actual dispatched quantities. Closing an undispatched remainder no longer leaves an otherwise settled delivery labelled partly received. Approved quantities and posted ledger entries are preserved. The existing mobile API stage values remain compatible.
- Receive controls require both site access and an authorized receiver role. Release/remainder controls require visibility of the selected source warehouse in addition to the inventory capability. Server permissions remain authoritative.
- Approval inputs reuse domain validation, explain invalid quantities beside the affected material and require at least three characters when a reduction reason is needed.
- The web request list shows delivery progress separately from approval status. The approval filter is labelled explicitly. Requesters without warehouse access no longer see a column full of restricted balances; permissions are unchanged.
- A new request chooses a project/site automatically only when there is exactly one choice. Multiple assignments require an explicit selection. Unassigned users receive an explanation instead of an empty form.
- Mobile project forms use the shared Philippine date function, including the midnight/year boundary, rather than the device timezone. Driver expenses already used the correct Philippine date.

## Verification

All 18 database suites below passed:

| Area | Scripts |
| --- | --- |
| End-to-end ERP, including billing, purchasing, permissions, stock and cost reconciliation | `test:erp-workflow` (42 checks across five roles) |
| Reservation, concurrent releases, sourcing and remainder closure | `test:material-reservations`, `test:inventory-concurrency`, `test:request-assignment`, `test:close-remainder`, `test:planning-shortage`, `test:stock-simplification` |
| Batch costing, asset expenses, budgets, fuel, payroll and attendance | `test:batch-costing`, `test:asset-expenses`, `test:project-costs`, `test:vehicle-fuel`, `test:payroll`, `test:qr-attendance` |
| Mobile requests, warehouse access, receipt-backed stock, itemized purchases and report integration | `test:simple-mobile-requests`, `test:mobile-warehouse`, `test:receipt-stock-entry`, `test:mobile-itemized-purchases`, `test:mobile-integration` |

Web: 136 unit/domain checks passed; typecheck, lint and production build passed. Mobile: 25 tests, typecheck and lint passed. New regressions cover closed undispatched remainders, still-reserved quantities, partial transit and fully lost deliveries; date tests cover Philippine midnight and year rollover.

Browser verification used the local web application against the connected staging data, read-only except for signing in/out. Admin request lists display Received alongside Approved for received records. An Engineer with multiple assignments must choose the project, cannot approve their own request, and sees only the applicable stock information. Screenshots are in `D:/Client-Project/output/logic-audit-20261110`.

## Release boundaries

No new database migration is required. Web and mobile source changes are separate commits. The mobile date fix requires a mobile release to reach installed copies; this audit does not build or submit a new AAB. These checks cover the listed workflows and scenarios, not a claim that every screen or physical-device interaction is defect-free.

## Plain-language stock guide

- Requested: the amount the site asks for. It does not move stock.
- Approved: the amount allowed for this request. Its stock is set aside until release or cancellation.
- Warehouse available: stock that can still be allocated to a request.
- Released / On the way: stock has left the warehouse and is waiting for site confirmation.
- Received: the site has confirmed the delivery. Site stock changes at receipt and later decreases when use is recorded.
