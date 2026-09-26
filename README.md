# Nognog Enterprises — Construction ERP

> **Project blueprint, feature checklist, acceptance criteria, and development tracker** for the web-first Construction ERP. The responsive web application is the only active client; shared domain contracts keep a future native client possible without carrying Expo or React Native today.

**Document status:** Web-first Package 3 implementation is in progress, **not production accepted**. Many connected screens, commands and migrations are coded, but the ordered migrations and real-role transaction tests have not run in an isolated Supabase database. The browser-only demo and staging-preview account switcher have been retired. The app uses one standard Supabase configuration and normal authentication; no staging-specific environment variables are required. See the item-by-item audit below and [Supabase configuration](docs/supabase-setup.md).
**Phase 11A status:** Historical local-demo work was retired. The old Phase 11A notes and dated progress entries are preserved as history, not current preview instructions.
**Requested package:** Package 3 — Complete Construction ERP, including the Package 1 and 2 features quoted by the client. This repository is the web-first delivery slice; Android/iOS implementation is deferred by the client's current instruction, not silently removed from the commercial package.
**Original indicative timeline:** 5–12 weeks (revalidate after discovery and prioritization)
**Payment terms discussed:** 50% before development / 50% on final turnover; confirm in the signed agreement
**Active platform:** Responsive web application. Native Android/iOS work is deferred until separately approved.
**Primary business goal:** Know what every project costs, what materials and equipment are at each location, who requested/approved/released/used them, and what remains available.

## 0. How to use this README

- `[ ]` **Not yet accepted** (this may mean missing, partial, or coded but unverified); `[x]` implemented **and tested** against the item's acceptance criteria. Keep GitHub task syntax; put the interim status beside the item or in the progress log. A static build or local demo does not close a connected/database workflow.
- Each task should have an owner/PR, acceptance evidence (test, screenshot, or walkthrough), and relevant database migration where applicable.
- The **Confirmed from conversation** section captures stated client needs; **Open decisions** are questions, **Proposed implementation** is architecture guidance, and **Possible future additions** are not automatically included in the agreed contract.
- For Codex, place the companion [`AGENTS.md`](./AGENTS.md) at the **repository root**. Read both files before modifying features. Keep this README synchronized with implementation.
- Work in vertical slices (data model → permissions → server mutation → responsive web screen → tests), rather than creating dozens of disconnected screens.

---

## 1. Requirements and scope baseline

### Confirmed from client discussion (to formalize in contract)

- [ ] Construction business ERP accessible through a responsive web application; preserve portable domain contracts for a possible future native client. — **Partial** (#1)
- [ ] Project creation, scheduling/target days, progress, expenses, sales/client payment monitoring, and project-level reports. — **Partial** (#2)
- [ ] Track material cost **per project**, actual material use per day, and remaining stock. — **Partial** (#3)
- [ ] Differentiate consumables (cement, sand, etc.) from reusable/fixed items and equipment. — **Partial** (#4)
- [ ] Separate **material inventory** from **equipment and vehicle registry/availability**. — **Coded; database verification pending** (#5)
- [ ] Multi-warehouse support and stock assigned to individual project sites. — **Coded; database verification pending** (#6)
- [ ] Foreman/engineer access from mobile-sized web layouts to request materials and equipment; warehouse or authorized staff process **in/out** and approvals. — **Partial** (#7)
- [ ] View request, release, receipt, consumption, return, and transfer history. — **Partial** (#8)
- [ ] Check available stock before requesting/procuring missing materials for a new project. — **Partial** (#9)
- [ ] Track supplier/hardware, purchase history, and changing material prices while preserving historical prices. — **Coded; database verification pending** (#10)
- [ ] Track workers, assigned project, attendance/work hours, labor rates, and project labor expense. — **Partial** (#11)
- [ ] Track equipment assignment, usage hours, and equipment cost by project. — **Partial** (#12)
- [ ] Daily project/site reports and per-project transaction reports. — **Partial** (#13)
- [ ] QR codes for identifying or processing suitable inventory/equipment records. — **Partial** (#14)
- [ ] Role-based visibility: users see only permitted projects, sites, stock, and actions. — **Coded; real-account/RLS verification pending** (#15)
- [ ] Include the quoted Package 1–3 web functions (purchase orders, dashboards, low-stock alerts, PDF/Excel exports and audit history); confirm exact acceptance criteria in the signed scope. — **Partial** (#16)

### Item-by-item implementation audit — 2026-09-25

The 16 rows below correspond **in order** to the 16 confirmed-needs checkboxes above. **Coded, unverified** means a connected web route and/or migration exists, but it has not passed the database, RLS and real-account tests required by the [definition of done](#definition-of-done-for-each-checkbox). **Partial** means a material part of the stated workflow is absent. None of these broad, combined checkboxes qualifies for `[x]` yet; a passing build or local demo is not equivalent to a tested live ERP. Native clients and deployment are deferred by the current web-first instruction.

| # | Confirmed need | Status | Code/evidence checked and remaining work |
|---|---|---|---|
| 1 | Responsive ERP; portable contracts | **Partial** | Next.js responsive web routes and the typed `packages/domain` package exist; connected end-to-end acceptance and several ERP workflows remain open. |
| 2 | Projects, schedules, progress, expenses, billing and reports | **Partial** | Connected project, progress, cost, billing and report routes exist, but their migrations and real-role workflows are unapplied/unverified. Project status/task and expense-approval coverage remain incomplete. |
| 3 | Daily material use, remaining stock and per-project material cost | **Partial** | Request fulfillment and weighted-average site-consumption commands are coded, but daily reports do not link posted consumption entries and opening stock values are unreconciled. |
| 4 | Consumables versus reusable/fixed items and equipment | **Partial** | The catalog separates `consumable`/`reusable` and assets have their own registry, but reusable materials are deliberately blocked from stock posting until custody and return are implemented. |
| 5 | Materials separate from equipment/vehicles | **Coded, unverified** | Separate material balances, equipment/vehicle registries and handover code exist; connected role and custody tests remain. |
| 6 | Multiple warehouses and project-site stock | **Coded, unverified** | Location-scoped balances, transfers and a warehouse selector exist; two-warehouse/site reconciliation and authorization tests remain. |
| 7 | Staff material/equipment requests; authorized in/out | **Partial** | Material request, assigned-engineer/admin decision, warehouse dispatch/site receipt and equipment handover code exist. Equipment site-receipt/transfer detail and real-role tests are incomplete. |
| 8 | Request, release, receipt, use, return and transfer history | **Partial** | Connected ledgers, request detail and asset events exist; connected reconciliation/history tests remain. |
| 9 | Stock shortage before request/procurement | **Partial** | Project material plan calculates needs and prefills requests/POs. There is no distinct purchase-request (PR) and PR-approval workflow. |
| 10 | Supplier history and changing prices | **Coded, unverified** | Supplier directory, dated quotes, POs and receipt-linked history exist; connected historical-price/PO receipt tests remain. |
| 11 | Workers, assignments, attendance, rates and labor expense | **Partial** | Connected project attendance posting/reversal and a paginated all-project attendance review screen are coded but remain database-untested. Foreman entry/manager approval remains open. |
| 12 | Equipment assignment, hours and project cost | **Partial** | Connected handover and usage/rate-snapshot cost commands exist; service/availability and connected overlap tests remain. |
| 13 | Daily site and project transaction reports | **Partial** | Report review, project progress and cost/transaction pages exist; approved daily reports do not explicitly link material, labor and equipment postings. |
| 14 | QR identification and processing | **Partial** | Opaque labels, print routes, web scanner, permission-scoped lookup and action prefill exist; authenticated scan/denial tests and direct action completion remain. |
| 15 | Role-scoped projects, locations, stock and actions | **Coded, unverified** | Auth, memberships, scoped queries and RLS policies are written; cross-project/location/export/Storage denial tests with real accounts have not run. |
| 16 | Package 1–3 web extras | **Partial** | PO, dashboards, low-stock alerts, PDF/XLSX export, notifications and audit code exist. PR workflow, complete role dashboards/notification coverage, connected tests and signed acceptance criteria remain. |

**Detailed README section check:** §3 roles are coded but real-account/RLS and capability-catalog acceptance is open; §4 master data/projects lack reusable custody, full project status/task coverage and verified BOQ pricing; §5 inventory has coded atomic commands but lacks daily-report links and database concurrency/reconciliation proof; §6 equipment lacks the full receipt/transfer, service and demo usage-cost path; §7 labor lacks the foreman approval path; §8 procurement lacks PR/review and several optional commercial details; §9 finance has provisional contract-minus-posted-cost reporting, not formal accounting or complete expense approvals; §10 daily reports lack posted-resource links; §11 role dashboards/notifications are incomplete; §12 QR is coded but unverified; §13 screens are not proof of workflow completion; §15 command acceptance requires database tests. §16 Phase 7/UAT/handover is not complete. These gaps remain unchecked in their original lists below.

**Current verification (2026-09-26):** `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit` (2), `npm run test:auth` (3), `npm run test:security` (1), `npm run test:requests` (5), `npm run test:inventory-domain` (5), and `npm run test:daily-reports` (3) passed. The retired `/demo` and `/setup` pages and the staging-preview account switcher are no longer part of the app. This is static/unit verification, **not** SQL/RLS or real-account proof. Database execution, role-by-role UAT and opening-value reconciliation remain unverified release gates; these use the same standard Supabase configuration, not staging-only variables. See [web release readiness](docs/web-release-readiness.md).

### Project scope boundary

**Included when signed off:** only items identified in the final scope/statement of work and its acceptance criteria. Checkboxes below are the proposed complete backlog, **not** evidence that every possible edge feature was paid for or approved. Changes after sign-off go through change control.

**Not assumed without approval:** automated payroll/tax/SSS/PhilHealth, government accounting compliance, GPS/fleet telematics, payroll disbursement, advanced accounting general ledger, AI predictions, custom IoT sensors, supplier portals, biometric attendance, offline-first synchronization, Apple/Google developer accounts, existing-record migration, or integrations with third-party accounting software.

**Current web-only boundary (2026-09-26):** no native Android/iOS client, app-store work or deployment is being implemented in this slice. Separate Project Manager, Accounting, Procurement, Owner, Super Admin and Worker login roles are deliberately excluded; their required web duties are assigned to the four roles in §3. Do not remove contracted web workflows merely because an extra role was removed. The remaining Package 3 web gaps in the audit above, database/RLS verification, opening-stock reconciliation, and role-by-role acceptance are still required before production use. Formal payroll, tax/accounting general ledger, GPS/telematics, supplier portals and biometric attendance are beyond the quoted workflow unless separately approved.

### Open decisions — resolve before estimating/building the affected module

| ID | Decision needed | Suggested default if client approves |
|---|---|---|
| D01 | Who may approve requests? | Assigned engineer approves another person's request; Admin approves exceptions and may override. |
| D02 | Can warehouse staff issue without a prior approved request? | Only via an authorized, audited direct adjustment/issue workflow |
| D03 | Are site stocks virtual locations or fully managed physical stores? | Each site is a stock location with balances and movement history |
| D04 | What does “fixed inventory” mean: reusable hand tools, permanent assets, or minimum stock level? | Split reusable assets from consumables; store minimum stock separately |
| D05 | Cost of materials: FIFO, weighted average, or specific batch/lot? | Weighted-average stock cost at site consumption; requires verified opening values and atomic valuation ledger |
| D06 | At what point is material charged to project: site receipt or actual consumption? | Consumption; allocated cost snapshots never change retroactively |
| D07 | What if consumption is recorded before internet connection returns? | Decide offline scope and conflict resolution before promising offline mode |
| D08 | Is QR required per material SKU, batch, bin, piece of equipment, or all? | Material SKU/location and individual equipment tag; confirm workflows |
| D09 | Can a worker or equipment item be assigned to multiple projects per day? | Yes, with explicit time allocations and no overlapping exclusive assignment |
| D10 | Equipment costing: hourly, daily, fixed, fuel, operator, maintenance? | Versioned hourly/daily rate; extras recorded separately, not double-counted |
| D11 | Client billing: progress billing, milestones, invoices, receipts, or simple manual payments? | Invoices with partial payments and auditable allocations to the issuing project |
| D12 | Supplier prices include delivery, discount, VAT, or other charges? | Keep purchase order line/unit price and additional charges distinct |
| D13 | Project budget should compare committed, consumed, and paid expenses? | Show distinct amounts; never merge into a single ambiguous “cost” |
| D14 | When should a separate native client be introduced? | Defer until the web ERP and shared contracts are stable, then approve scope and devices separately |
| D15 | Warehouse branches, user counts, project counts, records volume? | Confirm sizing and hosting plan |
| D16 | Exact branding, preferred language, notifications channel? | Responsive English UI initially; confirm before design sign-off |
| D17 | Will existing Excel records be imported? | Separate audited import plan if requested |
| D18 | Warranty/support response times, server ownership, backups, and handover? | Define in contract; third-party recurring costs separate |

**Connected-web decisions confirmed 2026-09-24, role consolidation 2026-09-26:** the assigned engineer approves material requests submitted by someone else; an administrator may approve exceptions and alone may post a reasoned unlinked stock-out exception (D01/D02). Material cost uses weighted-average stock cost at site consumption (D05/D06). Client billing uses invoices with partial payments (D11). An administrator approves damaged/missing-in-transit variances. Request fulfillment, opening-value verification, valued stock movement/consumption, POs and receipts, attendance, equipment usage costs, budgets, expenses, invoicing and billed-margin reporting are coded, but their migrations remain **unapplied and database-untested**. They are not live features. Real opening data and a management project-profit definition still need verification. Supplier credits, purchase-invoice matching and formal accounting/revenue recognition are not part of the quoted web scope unless separately approved.

**Opening-stock implementation choice requested by the client:** use administrator-entered, verified **quantity and total value per SKU per warehouse or project site** as the starting valuation. Reconcile these figures to existing stock records before posting; never infer a zero cost or substitute the latest supplier quote. A validated import can be added later if source records are supplied. The verification and transaction-locking code is present but **not operationally verified** until the ordered migrations and real-role/concurrency checks pass in an isolated database. An audited form now accepts documented legacy in-transit dispatch and already-received values before related location values; no actual company figures have been entered or reconciled.

---

## 2. Selected stack in code (external environments not yet verified)

| Layer | Proposed choice | Notes |
|---|---|---|
| Web | Next.js + TypeScript | Admin, finance, procurement, warehouse and reports |
| Core data | Supabase PostgreSQL | Relational, transactional, auditable ERP model |
| Authentication | Supabase Auth | Mapped to internal `profiles`, roles and memberships |
| Authorization | Database RLS + validated server commands | Never trust a UI-only role check |
| Core inventory mutations | PostgreSQL functions/transactions invoked through trusted server path | Lock affected balance rows; atomic ledger and balance changes |
| Files | Supabase Storage | Receipts, project photos, attachments, generated documents |
| Live updates | Supabase Realtime | Convenience only; database remains source of truth |
| Hosting | Vercel for web; appropriate hosted Supabase plan | Confirm regions, budgets and data retention |
| QR scanning | Browser camera API with manual lookup fallback, after workflow approval | QR contains opaque identifier, not pricing or authority |
| Reports | Server-generated CSV/XLSX/PDF | Authorize export against same data policies |
| Offline operations (if signed) | Durable outbox + conflict design | Not promised until D07 is resolved |

### Architecture rules

- **One source of truth:** PostgreSQL stores immutable business records plus transactionally updated balances. Do not let client code directly mutate inventory balances or approved monetary values.
- **Transactional commands:** receive, transfer, issue, consume, return, adjust, reserve, approve and reverse through well-defined server/database operations.
- **Permissions at every layer:** authenticate session, verify membership/role/location/project, apply RLS/grants; never expose service-role keys in apps.
- **Cost snapshots:** store actual unit cost and applicable rates on posted transaction lines; later changes to suppliers, wages or equipment rates affect future entries only.
- **Realtime is not accounting:** UI subscriptions refresh views after commits; changes must succeed without a WebSocket connection.
- **Append-only trace:** posted financial/stock entries are reversed or corrected by new authorized records, not silently deleted.

---

## 3. Roles and access checklist

The web ERP now defines exactly four login roles: **Admin, Engineer, Foreman, Warehouse Staff**. The owner uses an Admin account. Procurement and finance are Admin capabilities, not separate roles. Workers remain employee records for assignments, attendance and costing, not independent login roles. The Admin account is bootstrapped through the controlled setup/seed; an Admin may invite the other three roles but may not grant or deactivate a peer Admin.

- [ ] Define user-to-company membership model (even if deployment is single-company).
- [ ] Define role/permission catalog as capabilities, not only role-name string checks.
- [ ] Assign users to projects and permitted warehouse/site locations.
- [ ] Admin controls master data, users, procurement, finance and cross-project reports.
- [ ] Engineer sees assigned projects, maintains material plans and reviews another person's requests/reports; Admin handles exceptions.
- [ ] Foreman sees assigned project/site inventory and creates requests/daily reports.
- [ ] Warehouse Staff sees assigned stock locations, picks/releases/receives/transfers and performs controlled stock counts.
- [ ] Admin handles supplier profiles, quotes, POs, purchasing, contracts, expenses, collections and restricted profitability reports.
- [ ] Apply RLS to exposed tables, including join/line tables and storage access policies.
- [ ] Protect views/functions from bypassing RLS; explicitly review function grants and execution identity.
- [ ] Audit permission grants, approvals, status changes and sensitive record access as appropriate.
- [ ] Test role escalation, cross-project access, cross-warehouse access and export permissions.
- [ ] Disable/revoke departed staff immediately without erasing authorship history.

---

## 4. Master data and project setup

### Company and reference data

- [ ] Company profile, logo, contact and default currency (PHP).
- [ ] Unit of measure (bag, kg, m³, liter, piece, hour, day, etc.) and allowed conversions.
- [ ] Material categories, SKUs, names, specifications and active/archive status.
- [ ] Separate catalog types: **consumable stock**, **reusable tracked item**, **serialized equipment/vehicle**.
- [ ] Consistent naming/unique identifiers for suppliers, clients, employees, warehouses, locations, assets and projects.
- [ ] Rate/price effective dates; never overwrite old posted transaction prices.
- [ ] Optional item photos, descriptions, documents and QR labels.
- [ ] Minimum stock/reorder thresholds by warehouse or site (not confused with fixed assets).

### Project management

- [ ] Create/edit/archive project; unique code, customer, address and description.
- [ ] Contract amount, planned budget and dates (start, target completion, actual completion).
- [ ] Project statuses (draft, planned, active, paused, completed, cancelled, archived).
- [ ] Project-to-site stock location mapping and default source warehouse.
- [ ] Assign project manager, engineers, foremen, workers and authorized warehouses.
- [ ] Planned material requirements / bill of quantities (BOQ) with units and estimated prices.
- [ ] Compare BOQ vs available stock and create shortage requests without auto-purchasing.
- [ ] Milestones/tasks and percent-complete updates with dated evidence/remarks.
- [ ] Project overview: budget, commitment, actual consumption, labor, equipment, other cost, billed, collected and remaining balances (clearly labeled).
- [ ] Project history/timeline of requests, transfers, daily reports and expense changes.
- [ ] Block destructive project deletion once posted transactions exist.

---

## 5. Materials, multi-warehouse and inventory

### Location and stock model

- [ ] Create multiple warehouses and site locations, optionally with bins/sections.
- [ ] Track material balance per **item + location + approved inventory dimension** (lot/batch if enabled).
- [ ] Display on-hand, reserved, available (= on-hand − reserved), in-transit and minimum quantity distinctly.
- [ ] One unit-of-measure baseline per item; validate conversions and precision.
- [ ] Do not combine countable serialized equipment with fungible cement inventory.
- [ ] Inventory dashboard per warehouse, project site, item and low-stock condition.
- [ ] Stock count, discrepancy, adjustment reason, permission and audit trail.
- [ ] Guard against negative stock except a separately approved and tested business rule.

### Stock lifecycle / transaction types

- [ ] Opening balance (audited initialization; not freeform app-side editing).
- [ ] Purchase receipt → warehouse stock in.
- [ ] Warehouse → warehouse transfer.
- [ ] Warehouse → site transfer with dispatch, in-transit, receipt and discrepancy handling.
- [ ] Request allocation/reservation (reservation is **not** a stock deduction).
- [ ] Issue/release that actually decrements source stock.
- [ ] Site material consumption recorded against project, daily report and unit cost.
- [ ] Return of unused stock site → warehouse (reverse allocation where appropriate).
- [ ] Damaged/lost/wasted quantity with approved reason; supplier returns only if separately agreed.
- [ ] Reversal/correction flows; preserve original and correcting records.
- [ ] Stock-card/ledger and opening/closing balance report for any date range.
- [ ] Duplicate request/retry cannot double-decrement stock (idempotency key).
- [ ] Two competing issuances cannot drive quantity below available stock (row lock/atomic validation).

### Foreman material request → approval → in/out

- [ ] Foreman/engineer selects assigned project, site, items, requested quantity and required date.
- [ ] Show *available* stock at allowed warehouse/site and outstanding requests.
- [ ] Record purpose/remarks and optional photo attachment.
- [ ] Configurable approval chain and partial approve/reject with reason.
- [ ] Notify requester when approved/rejected/partially filled.
- [ ] Warehouse sees approved pick list, checks availability again on release.
- [ ] Support partial fulfillment and outstanding quantities.
- [ ] Warehouse staff records issuer, quantities, time and destination.
- [ ] Receiver confirms quantities; shortages/damage are logged, not hidden.
- [ ] After receipt, material remains **site inventory until consumed**.
- [ ] Foreman records daily actual use; show used vs released and remaining.
- [ ] Unused stock can return; no double charging or phantom stock.
- [ ] Status history including actor and timestamp for each transition.

**Illustrative example:** Warehouse has 100 bags cement. Project A requests 50; approve and release 50; source warehouse becomes 50; site receives 50; foreman consumes 20; site has 30; only the consumed 20 is the material consumption cost under default D06. Approval by itself does not change on-hand. If the client adopts another costing policy, explicitly revise all reports/tests.

---

## 6. Reusable tools, equipment and vehicles

- [ ] Separate equipment/vehicle registry from material SKU balances.
- [ ] Asset code, type, make/model, serial/plate (if applicable), ownership, photo, QR tag and current condition.
- [ ] Asset location, assignment, custody, availability, service status and deactivation.
- [ ] Equipment/vehicle request by project, foreman or engineer.
- [ ] Request approval, dispatch/check-out, site receipt, return/check-in and transfer.
- [ ] Track custody history, destination, staff and timestamps.
- [ ] Actual project usage in hours/days with approved rate snapshot per entry.
- [ ] Prevent overlapping exclusive-use allocations; allow configured shared use only with verified allocation.
- [ ] Record operator (if applicable) and distinguish operator labor from equipment charges.
- [ ] Optional fuel, repair, maintenance, rental and transport expenses with no double count.
- [ ] Mark unavailable while under maintenance; track service history if in agreed scope.
- [ ] Report equipment hours, utilization, direct cost and allocations per project.
- [ ] Reusable hand tools: tracked quantity or serial units; returned to stock rather than “consumed.”

---

## 7. Labor, attendance and worker costs

- [ ] Worker records: identity, employment status, trade/role and active flag.
- [ ] Project and foreman assignment with effective dates.
- [ ] Labor rates (hourly/daily/piece-rate only if explicitly specified), versioned by effective date.
- [ ] Daily attendance: present, absent, time-in/out or hours worked according to agreed workflow.
- [ ] Foreman daily entry with manager approval and edit/correction history.
- [ ] Allocate worker hours to project; prevent accidental overlapping hours.
- [ ] Distinguish regular/overtime, travel and allowances only if agreed.
- [ ] Post actual labor cost using historical rate snapshot; do not retroactively recalculate when rate changes.
- [ ] Project labor summary by worker, period and category.
- [ ] Personal data access restricted by role; retention/privacy requirements agreed.
- [ ] Clarify **cost tracking ≠ full payroll system** unless separately contracted.

---

## 8. Suppliers, pricing, procurement and receiving

- [ ] Supplier/hardware directory with contact details, address, active status and notes.
- [ ] Supplier-item catalog and unit-of-measure crosswalk.
- [ ] Record dated quoted prices and/or last purchased price per supplier/item.
- [ ] Preserve history: ₱100 cement purchase remains ₱100 even if future quote is ₱120.
- [ ] Material shortfall → purchase request (PR) linked to project or warehouse demand.
- [ ] PR review/approval; record authorization and rejection reasons.
- [ ] PO with supplier, price/currency, unit, quantity, discount/taxes/delivery, due date and status.
- [ ] Receive partially or fully into selected warehouse; inspect shortages/rejections.
- [ ] Record actual purchase price/cost on receipt/batch according to approved valuation rule.
- [ ] Attach invoice/delivery receipt/photo; create payable/expense records only under agreed accounting rules.
- [ ] Supplier comparison and price trend report with date/source.
- [ ] PO close/cancel; returned/replaced supplier deliveries and purchase-invoice matching only if separately agreed.
- [ ] Confirm when a purchase becomes an expense vs inventory value to avoid double counting.

---

## 9. Expenses, project costing, sales and profitability

### Cost sources

- [ ] Material consumption (cost according to D05/D06).
- [ ] Labor time and historical labor rate.
- [ ] Equipment operating time and rate, excluding separately posted extras.
- [ ] Transportation, fuel, subcontractor, site expenses and authorized manual categories.
- [ ] Supplier or overhead allocations only with explicit category/rule.
- [ ] Receipts/photos and staff attribution for manual expenses.
- [ ] Expense state: draft, submitted, approved, posted, reversed.
- [ ] Distinguish budget, commitments (approved PO), incurred expense, cash paid and project revenue.

### Contract revenue and collections

- [ ] Record client, project contract amount, approved change orders (if agreed) and effective value.
- [ ] Manage billing/invoices or simpler collection records, per D11 decision.
- [ ] Record client payments, date, amount, reference and outstanding balance.
- [ ] Track paid/unpaid/partially paid and overdue status where applicable.
- [ ] Prevent duplicate payment posting with idempotency/reference validation.
- [ ] Display **estimated gross project margin** separately from collected cash and outstanding receivables.

### Reporting calculations (specify exact definitions in code and UI)

```text
Actual Material Cost = SUM(posted project material consumption cost)
Actual Labor Cost    = SUM(posted labor allocations at historical rate)
Actual Equipment Cost= SUM(posted equipment usage charges at historical rate)
Other Actual Cost    = SUM(posted other approved/allocated costs)
Actual Project Cost  = Material + Labor + Equipment + Other
Estimated Gross Profit = Approved Contract Value - Actual Project Cost
Gross Margin %       = Estimated Gross Profit / Approved Contract Value * 100
Cash Collected       = SUM(posted client receipts)
Receivables          = SUM(issued invoices) - SUM(applied receipts) [if invoices enabled]
```

> These are **management-reporting definitions**, not a promise of GAAP/PFRS tax accounting. Decide separately how inventory valuation, VAT, overhead, unbilled work, change orders, payable balances, and WIP are treated. Label incomplete project margin as provisional.

---

## 10. Daily site report and progress monitoring

- [ ] Responsive web daily report for each assigned project/site/date; native client deferred.
- [ ] Select/report materials actually consumed today (item, quantity, unit, cost snapshot).
- [ ] Capture worker attendance/total labor hours for the day.
- [ ] Capture equipment used and start/end or total operating hours.
- [ ] Report site progress, completed activities, blockers and next-day plan.
- [ ] Attach site photos and remarks; ensure upload failure does not silently lose report.
- [ ] Draft → submitted → approved/returned for correction workflow.
- [ ] Link posted usage to underlying transaction IDs to prevent double entry in costs.
- [ ] Show daily, weekly and monthly site reports and project summaries.
- [ ] Record who submitted/approved/edited and when.
- [ ] Define late entries/backdating rules and corrections with audit trail.

---

## 11. Dashboards, analytics, exports and notifications

**Notification status (verification pending):** The web app has a bell, paginated center, detail view, unread counts, read/unread actions and recipient-scoped Realtime refresh with reconnect polling. SQL defines a typed outbox, retry/failure handling, scheduled processing, and event hooks for material requests, dispatch, daily-report review and low stock. That is **not** complete coverage of the approval, receipt, asset, late-return and finance events in the checklist. None of the new migrations, cron jobs or recipient/RLS behavior has been exercised against staging; no production delivery is claimed. Native push remains deferred. See `docs/phase10a-notifications.md`.

- [ ] Owner dashboard: active projects, cost vs budget, collections, request queue and at-risk stock.
- [ ] Project dashboard: progress, plan vs actual, resource usage and cost breakdown.
- [ ] Warehouse dashboard: stock by location, in-transit, reserved, below minimum and discrepancies.
- [ ] Equipment dashboard: availability, upcoming return and operating hours.
- [ ] Procurement dashboard: pending PR/PO, supplier history and late receipts.
- [ ] Foreman home: assigned sites, on-hand site stock, pending requests and report shortcut.
- [ ] Filter and paginate by project, date, site, supplier, item, worker and transaction type.
- [ ] PDF and XLSX/CSV exports with authorization, filters, generation date and source definitions.
- [ ] Notifications for approvals/rejections, dispatch/receipt, shortage, low stock, late returns and report reminders (channels to confirm).
- [ ] Realtime refresh where useful; robust manual refresh and reconnection handling.
- [ ] Audit viewer with before/after where appropriate and safe masking of secrets.
- [ ] Activity timeline per project, request, material, asset and user.

---

## 12. QR code workflow

**QR status (verification pending):** The registry links material SKUs, equipment/vehicle assets, warehouses and project sites. It issues opaque `NQ-` identifiers, keeps one active label per record, records replacement/deactivation history and renders labels through authenticated routes. A responsive browser scanner and manual lookup now resolve a label and offer role-scoped links to eligible workflows. A label identifies a record, never a quantity or authority. Batch/bin labels are unsupported and D08 still needs a product decision. Database/RLS tests and real-role scan/action walkthroughs remain outstanding; no native client was added.

- [ ] Decide QR label entity and print format (material SKU, storage bin, asset or issued batch).
- [ ] Generate unique opaque code; avoid embedding personal data, price or privileges.
- [ ] Mobile-sized web scan → authenticated lookup → permitted detail/actions.
- [ ] Material scan adds eligible item to request or stock transaction, with quantity input.
- [ ] Equipment scan opens asset and allows authorized check-out/check-in/usage.
- [ ] Handle unknown, damaged, duplicate and archived QR codes.
- [ ] Verify site/location/role after scan; QR possession grants no special permission.
- [ ] Provide manual search fallback for camera-denied or unreadable QR.

---

## 13. Screens checklist

### Web dashboard

- [ ] Sign in / forgot password / user profile.
- [ ] Overview dashboard and alerts.
- [ ] Users, permissions and project/site memberships.
- [ ] Project list, project detail, budgets, BOQ, progress and history.
- [ ] Warehouse/site list and location inventory.
- [ ] Materials catalog, stock card, stock counts and adjustments.
- [ ] Material/equipment request inbox and approval detail.
- [ ] Receiving, dispatch, transfer, site receipt and return.
- [ ] Equipment/vehicle registry, assignments and usage.
- [ ] Employees, assignments, labor rates and attendance review.
- [ ] Supplier directory, historical price list, PR/PO and receiving.
- [ ] Expense review, sales/collections and project P&L.
- [ ] Daily reports review, PDF/XLSX reports and audit logs.
- [ ] Settings, notification preferences and master reference tables.

### Future native client (deferred; not present in this repository)

- [ ] Revalidate the business case, platforms, offline scope, and support model before implementation.
- [ ] Login/session management and assigned-project selector.
- [ ] Foreman dashboard: project status, alerts and site inventory.
- [ ] Material request create/detail/history/status.
- [ ] Equipment request create/detail/history/status.
- [ ] QR scanner and manual item/asset search.
- [ ] Warehouse pick/release, mobile receipt, transfer and return (warehouse role).
- [ ] Material consumption/usage entry.
- [ ] Equipment check-out/check-in and usage hours entry.
- [ ] Worker attendance/daily labor entry.
- [ ] Daily report drafts, submission and history.
- [ ] Notifications, attachment upload and profile.
- [ ] Empty, loading, failure, permission denied and offline states.
- [ ] Android and iOS camera, file, keyboard, date/time and navigation QA.

---

## 14. Proposed data model (starting point, revise through discovery)

Do **not** generate tables blindly from this list. Final schema must be normalized around the approved business workflows, with foreign keys, indexes, unique constraints, CHECK constraints, timestamps, status transition rules, and migrations.

```text
auth.users                 Supabase identity provider
profiles                   application user / employee linkage
roles / permissions        capability catalog
user_roles                 user → role
project_memberships        user → project and permission
location_memberships       user → warehouse/site visibility
clients / projects         contract, budget, schedule and progress
project_tasks              activities / milestones
project_material_plans     BOQ and estimated requirement lines
locations                  warehouse / site / bin hierarchy
materials / material_uoms  material SKU, type, conversions
inventory_balances         fast current on-hand/reserved by item+location(+lot)
inventory_movements        immutable posted stock ledger and references
inventory_reservations     approved holds and expiry/fulfillment status
material_requests          header, project/site/requester/status
material_request_items     item, requested/approved/issued/received quantity
request_approvals          actor, level, action and timestamp
stock_transfers            source→destination and transit lifecycle
stock_transfer_items       dispatch/received/damaged/short line quantities
stock_counts / count_items reconciliation and adjustment authorization
assets                     equipment/vehicle/reusable serialized tools
asset_requests / items     approved requests and allocations
asset_assignments          movement/custody and status history
asset_usage                project, dates, hours, applied rate and expense link
employees                  worker master record
labor_rates                rate effective periods
attendance / time_entries  worker, project, day, hours and approval
suppliers                  hardware/vendor master
supplier_price_history     dated quote/unit-cost history
purchase_requests / items  procurement demand
purchase_orders / items    supplier commitment and agreed price
purchase_receipts / items  accepted quantity, actual cost and location
project_expenses           posted non-duplicated expense ledger
expense_categories         expenses taxonomy
project_billing            invoice/milestone if D11 enabled
client_payments            incoming collections and allocations
daily_reports              site progress, notes, photos and approval
daily_report_lines         references to posted material/labor/equipment items
file_attachments           storage path, owner, category and visibility
notifications              recipient, event, read state
activity_audit_logs        actor, action, entity, before/after metadata
idempotency_keys           operation+actor+key+result/expiry
```

**Important relational rules**

- Monetary values: PostgreSQL `numeric`, not floating-point. Quantity precision per item/UOM.
- Foreign keys include company/project/location context; don't allow an item from Project A to be posted under Project B without an explicit transfer/allocation.
- Store both UTC timestamps and user-friendly Philippines display times; calendar-day reporting uses the agreed site timezone.
- `created_by`, `updated_by`, `approved_by`, `posted_by`, `reversed_by` only where meaningful; don't overload a single user field.
- Inventory balance is a projection of posted events; reconcile it with the ledger regularly.
- Equipment **usage** and material **consumption** create or reference costs exactly once.
- Supabase `public` schemas, RLS policies, storage policies, grants, and function security must be reviewed together.

---

## 15. Transaction contracts / state machines

### Material request

```text
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / PARTIALLY_APPROVED / REJECTED
APPROVED → RESERVED (optional) → PARTIALLY_ISSUED / ISSUED
ISSUED → IN_TRANSIT → PARTIALLY_RECEIVED / RECEIVED → CLOSED
SUBMITTED or APPROVED → CANCELLED (if no irreconcilable issue)
```

**Never assume status alone proves quantity.** Derive remaining fulfillment from item-level approved, issued, received and returned quantities. Define allowed transitions, required role, expected previous state, rejection reasons and audit events. An approved request is not a purchase and is not consumption.

### Transfer, consumption and cost

```text
Approve request
  → reserve stock (if configured)
  → warehouse dispatch: decrement source and mark in transit
  → site receipt: increment destination and close transit difference
  → site consumption: decrement site and post material cost to project
  → unused return: site dispatch → warehouse receipt, adjust site stock
```

Handle lost/damaged-in-transit as a distinct approved outcome. Do not make a transfer create duplicate on-hand at both locations. Pick a consistent policy for valuation through returns, adjustments and partial receipt.

### Equipment

```text
AVAILABLE → REQUESTED → APPROVED → CHECKED_OUT / IN_TRANSIT
→ ON_SITE / IN_USE → RETURNED / TRANSFERRED → AVAILABLE
(optional: MAINTENANCE / RETIRED)
```

Actual hours require timestamp or quantity validation and rate version. Status and assignment/usage are distinct facts.

### Core command acceptance criteria

- [ ] `submit_request`: validates role, project, line quantities and duplicate key.
- [ ] `approve_request`: enforces approval matrix and allowed transition; preserves partial approvals.
- [ ] `reserve_stock`: cannot reserve more than available; concurrent safe.
- [ ] `dispatch_stock`: atomic ledger + source balance + transit + request fulfillment.
- [ ] `receive_stock`: atomic transit decrease + site/warehouse balance increase + discrepancy.
- [ ] `consume_material`: authorized site/project + sufficient site stock + cost snapshot + once-only expense.
- [ ] `return_material`: links prior issue/receipt where required; quantity and valuation validated.
- [ ] `post_equipment_usage`: validates project, assignment, time overlaps, rate and duplicate posting.
- [ ] `post_labor_entry`: validates project, approved hours and historical rate.
- [ ] `post_purchase_receipt`: validates PO, received qty and stock valuation.
- [ ] `reverse_transaction`: authorized compensating entry; retains original; recomputes affected projections.

---

## 16. Development phases and task tracker

Do not implement later phases until previous critical business flows are validated. Tasks may be moved between sprints, but dependencies must hold.

### Phase 0 — Discovery, design and sign-off

- [ ] Conduct workflow interview with owner, foreman, engineer, warehouse and finance.
- [ ] Resolve D01–D18 or mark explicit phase-2 deferrals.
- [ ] Capture real example: one project, two warehouses, one site, one material request, PO, labor and equipment day.
- [ ] Approve wireframes, access matrix, report definitions and inventory/cost rules.
- [ ] Confirm package, complete scope, exclusions, milestones and acceptance tests in signed agreement.
- [ ] Confirm hosting/server ownership, developer account access and recurring services.

### Phase 1 — Project foundation

- [ ] Initialize monorepo/app boundaries, formatting/lint, CI and environments.
- [ ] Create Supabase dev/staging/prod strategy and migration pipeline.
- [ ] Auth, user profiles, role/permission checks, company/project/location membership and RLS tests.
- [ ] Shared validation schemas, typed DB client and error/result contracts.
- [ ] Logging, error reporting, secrets policy and backup/restore drill.

### Phase 2 — Projects, locations and materials

- [ ] Project creation/assignments and warehouse/site structure.
- [ ] Materials, UOM, catalog, minimum stock and opening balances.
- [ ] Read-only stock dashboard, movement list and stock-count prototype.
- [ ] Verify connected test data with linked projects, warehouses, sites and four-role assignments in a disposable database. The local demo and preview switcher were retired; see [Supabase configuration](docs/supabase-setup.md).

### Phase 3 — The must-work inventory vertical slice

- [ ] Foreman material request in the responsive web application.
- [ ] Authorized web approval.
- [ ] Warehouse pick, release and dispatch.
- [ ] Site receipt and variance handling.
- [ ] Daily consumption posting and project cost snapshot.
- [ ] Partial issue, returns, retries and concurrency tests.
- [ ] End-to-end demo with client using real cement example.

### Phase 4 — Procurement, suppliers and reports

- [ ] Supplier price history, PR, PO and partial purchasing receipt.
- [ ] Shortage-to-PR workflow from project plan/approved request.
- [ ] Stock card, material cost report and exports.

### Phase 5 — Equipment, vehicles and labor

- [ ] Asset registry, requests, assignments, check-in/out and hours.
- [ ] Worker assignment, attendance, rate history and labor costs.
- [ ] Daily site report with linked transactions and photos.

### Phase 6 — Finance, dashboard and notifications

- [ ] Project expenses, budget comparison and authorized posting.
- [ ] Contract/client, billing/collections per approved D11 workflow.
- [ ] Profitability and project/warehouse/operations dashboard.
- [ ] Low stock, request and completion notifications; audit explorer.
- [ ] QR printing/scanning and permission checks.

### Phase 7 — Hardening and handover

- [ ] Accessible responsive-web QA on agreed browsers and viewport sizes.
- [ ] Security, RLS, migration, retry/concurrency and data-reconciliation tests.
- [ ] Performance checks on agreed expected data volume.
- [ ] Backup and restore rehearsal with written recovery plan.
- [ ] Client UAT and recorded sign-off of agreed acceptance criteria.
- [ ] Admin/foreman/warehouse training and user manual.
- [ ] Production deployment, monitoring, domain and app store submission if agreed.
- [ ] Turnover of source repository, credentials ownership, database, documentation and licenses.
- [ ] Warranty/bug-fix terms and post-launch support boundaries documented.

---

## 17. Minimum test / UAT scenarios

A task is not done merely because the happy-path page renders.

| ID | Scenario | Expected result |
|---|---|---|
| T01 | Foreman tries another project's stock | Denied at data layer and UI |
| T02 | Two users release last cement simultaneously | One succeeds/adjusts quantity; no negative/oversold stock |
| T03 | Retry dispatch after network timeout | Same result/idempotency, not a second issue |
| T04 | Approve request of 70 with 50 available | Partial/blocked according to D01 and reservation policy |
| T05 | Transfer 50 warehouse → site | Source −50; transit then site +50; global total unchanged except confirmed variance |
| T06 | Consume 20 from site 50 | Site 30; project cost for 20 only, once |
| T07 | Return 10 unused to warehouse | Site −10, source warehouse +10 after receipt; cost follows chosen valuation |
| T08 | Supplier changes cement price 100 → 120 | Old posted lines remain 100; new purchases use approved current price |
| T09 | Employee pay rate changes | Old labor costs unchanged; new time entries use applicable rate |
| T10 | Equipment used 5 hours | Allocated cost = recorded approved hours × rate snapshot; no overlap double-charge |
| T11 | Warehouse issues item not in approved quantity | Block or require audited override according to policy |
| T12 | Closed/archived project edited/deleted | Existing posted history preserved; permission/state rules apply |
| T13 | Unauthorized user exports project P&L | Forbidden by server/export endpoint |
| T14 | QR label of unrelated asset scanned | Can identify only if permitted; cannot perform unauthorized action |
| T15 | Partial delivery/receipt and damaged bags | Quantities reconcile; pending quantity and variance displayed |
| T16 | Duplicate daily report material line | Does not post cost or inventory twice |
| T17 | Offline/reconnect or lost realtime socket | Existing data retained and reloads; offline writes only if explicitly implemented |
| T18 | Restore backup to isolated environment | Data and essential file references verified; restore documented |
| T19 | Client payment entered twice | Duplicate guarded; collected/outstanding totals correct |
| T20 | Month-end stock card vs balance | Reconciliation passes per material/location and tracked dimensions |

### Definition of done for **each** checkbox

- [ ] Acceptance scenario agreed and implemented.
- [ ] Appropriate role, input, quantity, money and status validation at server/database level.
- [ ] Database migration, RLS/grants and indexes created/reviewed if needed.
- [ ] Empty/loading/error/partial-success and narrow responsive layout states handled.
- [ ] Automated unit/integration/E2E tests appropriate to risk.
- [ ] Audit, duplicate retry and concurrency tests for posted stock or money.
- [ ] Browser and responsive-device walkthrough evidence linked in issue/PR.
- [ ] README checklist and decision log updated; no unsupported claim of completion.

---

## 18. Repository layout

```text
nognog-enterprises/
├── AGENTS.md                     # Codex instructions; stays brief and enforceable
├── README.md                     # Source of product scope, checklists and acceptance
├── src/                           # Next.js responsive web application
├── packages/
│   └── domain/                    # portable types and validation contracts
├── supabase/
│   ├── migrations/                # immutable ordered schema/function changes
│   ├── seed.sql                   # fake development fixtures only
│   └── ...                        # SQL test fixtures were removed at client request; staging RLS checks remain required
├── docs/
│   ├── permissions.md             # role × capability × scope matrix
│   ├── connected-web-workflows-2026-09-24.md
│   ├── web-first-implementation-status-2026-09-24.md
│   └── web-release-readiness.md   # connected deployment gate and open checks
└── .env.example                   # names only; never live credentials
```

### Local setup (complete with actual commands after repo initialization)

- [ ] Install exact runtime/package-manager versions pinned by repo.
- [ ] Configure environment variables documented in `.env.example`.
- [ ] Start local or dedicated development Supabase instance; never run tests against production.
- [ ] Apply migrations, run RLS/command tests, load fake seed data.
- [ ] Start the web application using real `package.json` scripts.
- [ ] Confirm browser camera permissions and manual QR fallback when that scope is approved.
- [ ] Check no secrets in Git or client bundles.

### Progress log

| Date | Phase | Finished and tested | Open issue / decision | Next smallest slice |
|---|---|---|---|---|
| TBD | Discovery | None yet | D01–D18 | Sign off workflows and costing rules |
| 2026-09-22 | Phase 1/2 | Web TypeScript, lint, and production build passed | Local database/RLS tests blocked because Docker engine is unavailable | Start Docker, reset local Supabase, run pgTAP, then perform role-by-role responsive-web QA |
| 2026-09-22 | Phase 3A | Materials/catalog, location balances, atomic stock commands, transfer lifecycle, ledger UI, and responsive inventory views implemented; web typecheck, lint, and production build passed | Database, RLS, and concurrency verification blocked until local Docker/Supabase is available; D01/D04/D05 remain stage blockers | Run the documented Phase 3A database suite and role walkthrough; do not start Phase 3B before it passes |
| 2026-09-22 | Phase 4A | Shared equipment/vehicle registry, configurable classifications, reused warehouse/site locations, asset status/history, secure web management, and Phase 4A pgTAP suite implemented; web typecheck, lint, and production build passed | Database/RLS verification remains blocked until local Docker/Supabase is available; D01/D08/D09/D10 block later equipment stages | Run Phase 4A database tests and the role-based registry walkthrough; do not start Phase 4B before it passes |
| 2026-09-22 | Phase 5A | Employee/category registry, optional profile links, private contacts, project/site assignment history, atomic transfer, versioned labor rates, secure web management, and a Phase 5A pgTAP suite implemented; web typecheck, lint, and production build passed | Database/RLS verification is blocked because the local Docker/Supabase service is unavailable; D09 and attendance/rate/correction policies block later labor stages | Start Docker, reset local Supabase, run Phase 5A pgTAP and role walkthrough; do not start Phase 5B before it passes |
| 2026-09-23 | Web-first cleanup | Removed the obsolete Expo/React Native application, native-only dependencies/scripts, and duplicate client surface; retained one reusable domain package | A future native client requires a new approved scope | Keep new functionality responsive and reuse domain/database contracts |
| 2026-09-23 | Phase 6A | Supplier registry, configurable categories, material catalogs, immutable price versions, comparison/history views, server actions, RLS, and pgTAP coverage implemented; web typecheck, lint, and production build pass | Database/RLS execution remains blocked until local Docker/Supabase is available; purchasing and receipt policies belong to later stages | Start Docker, reset local Supabase, run Phase 6A pgTAP and role walkthrough; do not start Phase 6B before it passes |
| 2026-09-23 | Phase 7A | Daily report drafts, submission, search/filter, project history, revision snapshots, project-scoped RLS, and pgTAP coverage implemented for responsive web; typecheck, lint, and Next production build pass | Database/RLS execution and role walkthrough are blocked while local Docker/Supabase is unavailable; Phase 7B depends on attendance, usage, consumption, and cost records not yet present | Start local Supabase, run the Phase 7A database suite and responsive role walkthrough before implementing Phase 7B |
| 2026-09-23 | Phase 9A | QR registry, secure generation/resolution/replacement/deactivation commands, entity-page controls, management UI, PNG/SVG labels, print view, and pgTAP scenarios implemented; web typecheck, lint, and build pass | Database/RLS tests and browser role walkthrough blocked because Docker/Supabase is unavailable; D08 batch/bin granularity and browser-scanner scope remain open | Start Docker, reset local Supabase, run Phase 9A pgTAP and role walkthrough; only then consider a responsive browser scanner for Phase 9B |
| 2026-09-23 | Phase 10A | Typed notification catalog, RLS-protected inbox/read history, idempotent outbox/processor, scoped recipient selection, responsive web center, and recipient-filtered Realtime refresh implemented; web typecheck, lint, and build pass | Docker/Supabase unavailable for migration, pgTAP, cron and browser role verification; no business-event hooks or native push implemented | Start Docker, reset local Supabase, run Phase 10A pgTAP and browser/reconnect walkthrough before Phase 10B |
| 2026-09-23 | Phase 11A | `/demo` opens the shared workspace shell with top-bar role selector; IndexedDB/Dexie v1, fictional seed, persistent banner, atomic reset and validated JSON import/export implemented; demo unit tests, typecheck, lint, build, browser role/navigation/refresh, CSP header, and disabled-by-default production route checks pass | Actual separate staging project, browser restart, request capture, and reset/import UI walkthrough still require target-environment verification; no native client by web-first decision | Verify full 11A isolation in pilot browser and separate staging project before starting 11B |
| 2026-09-23 | Phase 12A (limited web slice) | Local demo Settings, IndexedDB snapshots, explicit environment checks, local PNG/JPEG-to-WebP download, search-filter hardening and response headers implemented; demo/media/security tests, typecheck, lint, build and local browser snapshot persistence pass | No business upload flow exists; staging/production configuration, migrations/RLS, backups and full workflow verification remain untested. No production deployment or native work performed. The obsolete local-demo environment document has been retired. | Provision approved isolated staging, run migrations/pgTAP and role-by-role web QA before any production release |
| 2026-09-23 | Phase 1 account-access continuation | Web Users invitation/initial-role/status screens, self profile, password setup/recovery, narrower profile update grants, role-less catalog denial, and local demo Users preview implemented; typecheck, lint, build and focused web tests pass | Local PostgreSQL refused connection, so database verification and real email/session/RLS walkthrough remain unverified. Full material request/approval/costing is still blocked by D01/D05/D06 and earlier database gates. See `docs/user-onboarding.md` | Start isolated Supabase and recreate the removed SQL regression suite before live release; configure invite/recovery redirects and email, then perform the documented role-by-role onboarding walkthrough |
| 2026-09-23 | Demo navigation and workforce photos | Demo section links now change the URL without a document reload or repeated local table read; initial local-data skeleton, one-time sample portrait backfill, manager-only WebP employee photo upload, and per-render live auth deduplication added. Typecheck, lint, demo tests and build pass; browser verified collapsed sidebar persists through navigation. | Live authorization remains enforced per request. The SQL regression fixtures were removed at client request, so live database/RLS behavior cannot be considered release-verified. | Recreate database tests and perform staging role/RLS checks before using the live backend. |
| 2026-09-23 | Demo web UX | Moved preview role picker into the fixed-height demo strip; restored top search, notification bell and clickable profile; added bottom Help centre/Settings/Logout, centered Settings, and a concise four-metric dashboard with fictional WebP project imagery and record-backed recent activity. Demo role/search/notification/logout and 390px navigation browser checks, typecheck, lint, tests and build pass | Live project search remains scoped to projects; demo photos are illustrative, not project evidence. Full device matrix and authenticated live-environment QA remain open | Validate live user flows in isolated staging; keep business workflows gated by their phase tests |
| 2026-09-23 | Responsive shell | Added a persistent desktop sidebar collapse/expand control with accessible icon-only links; kept the mobile drawer fully labeled, scrollable, and dismissible by Escape. Verified 390px and 320px browser widths without horizontal overflow, and typecheck, lint, demo tests, and build pass | Full device matrix and authenticated live-environment QA remain open | Validate live user flows in isolated staging |
| 2026-09-23 | Inventory presentation and recovery UX | Added illustrative WebP thumbnails and searchable tables for demo inventory/equipment, role-scoped local add/stock-in actions, filtered CSV exports for demo and authenticated live views, icon-box dashboard metrics with explicitly illustrative trends, favicon from the existing logo, and branded 404/500 fallbacks using converted WebP illustrations. Typecheck, lint, demo/CSV tests, build, demo table/modal/export browser checks, and 404 status check pass | Live export/RLS behavior and 500 recovery need isolated staging/browser fault-injection QA; no actual business photo-upload flow exists | Validate exports and error recovery in staging before production rollout |
| 2026-09-23 | Demo navigation and local workflows | Added role-filtered search for pages, working actions, records and help guides; reusable accessible custom select picker; multiple local warehouses; and manager-only create flows for projects/sites, employees, suppliers and daily reports. Scoped demo dashboard data to visible roles. Typecheck, lint, demo tests, build, and browser search/form walkthrough pass. | The local demo is not live ERP parity: requests, transfer dispatch/receipt, procurement, attendance, costing and non-manager project assignment remain unavailable or subject to open decisions. Live Supabase/RLS is still unverified. | Agree outstanding workflow policies and verify live database/RLS in isolated staging before expanding the demo. |
| 2026-09-23 | Demo quick search and request preview | Replaced the full-page demo search with an accessible top-bar shortcut dropdown for pages, actions, guides and role-visible records. Upgraded local demo data to v2 without clearing v1 records; added manager project/warehouse access assignments and an illustrative request → approval → dispatch → receipt → site-use workflow with atomic movements, site balances, and consumption-only cost. Inventory now includes project-site stock, and role-scoped listings/search hide unrelated locations. Demo account-role choices use the connected app's permission rules. Typecheck, lint, demo tests, build and browser lifecycle checks pass. | The approved approval/unit-cost defaults are **demo only**. Warehouse transfers, procurement, attendance/payroll, QR/audit, real alerts and live Supabase/RLS verification are still open; local persona switching is not authentication. | Confirm live business policies and run isolated staging/RLS tests before implementing or releasing the connected version. |
| 2026-09-24 | Dashboard and empty-state polish | Shared a right-icon, large-value metric card between demo and connected dashboards, retaining explicitly illustrative trends only in demo. Added the existing `no-data.png` through an optimized reusable empty state for selected truly empty, createable sections; search misses and inaccessible records keep text-only feedback. Typecheck, lint, 23 demo tests, build, asset response and demo dashboard browser review pass. | Authenticated connected-dashboard browser review and empty-dataset visual walkthrough still need isolated staging or a separate preview dataset; no live data or policy changed. | Review the empty illustration at target mobile sizes and validate the connected dashboard in staging. |
| 2026-09-24 | Inventory, theme and employee contacts | Added a top-bar stock-location picker to demo and connected inventory, defaulting to one location instead of combining all balances; added persistent light/dark controls, searchable employee contact tables, optional private employee email in the connected schema, and manager-triggered recovery email for eligible connected accounts. Removed repeated demo notices from primary screens. Typecheck, lint, build, 28 focused tests and demo browser checks pass. | The new employee-contact migration and real recovery email/RLS flow have not been exercised against an isolated Supabase project; no password-reset email is sent for local demo personas. | Apply migration in staging, configure recovery redirects/email, then verify role visibility, location-scoped exports and reset delivery before production. |
| 2026-09-24 | Record photos, project table and SKUs | Project images now belong to demo project records, and manager-only project/warehouse forms support local WebP photos. The connected web forms include server-verified private WebP uploads and authenticated delivery; project and warehouse views display their photos. Demo and connected project tables expose status filters and ascending/descending sorting. Inventory displays its existing material code as SKU; equipment has an optional distinct SKU in demo and the connected schema; demo material requests display the material SKU. Removed redundant quick-search copy. Typecheck, lint, 29 focused tests, build, and demo project/warehouse/search browser checks pass. | The new photo/SKU migration, Storage RLS policies, and authenticated connected upload/download flow have not been run against Supabase because Docker is unavailable. The connected material-request workflow is not implemented, so SKU display there is demo-only. | Apply the migration in isolated staging; verify photo upload, replacement, private reads, RLS denial, SKU saving, and image limits under each role before live use. |
| 2026-09-24 | Web table and demo management polish | Switched the web app to Inter; standardized table header typography and code-first columns in project, inventory, asset, supplier and report tables; moved demo Supplier/Report creation above sortable tables; added manager-only edit/delete for eligible demo master records with linked-history guards; made project creation pill-shaped and warehouse form submission “Save”; expanded the role-aware Help centre; and aligned the top location picker with quick search. Typecheck, lint, 30 focused tests, production build, desktop browser checks and a 390px overflow check pass. | The demo remains local and does not authenticate against Supabase. Connected database/RLS, private photo delivery, and live role-by-role mutation checks still require isolated staging; connected SQL regression fixtures were previously removed at client request. | Run migrations and staging authorization/browser checks before production use; confirm demo-only edit/delete rules against signed business policy. |
| 2026-09-24 | Action menu and audit explorer | Replaced inline demo master-record actions with an accessible, viewport-aware three-dot View/Edit/Delete menu; distinguished project and warehouse icons; made primary actions and search controls pill-shaped; renamed equipment creation to “Add equipment.” Added a manager-only connected audit explorer over existing RLS-protected `audit_logs` metadata, a newest-first listing index migration, and local demo audit entries committed atomically with supported create/update/delete, stock, access-assignment and request lifecycle operations. Demo audit history is included in JSON export and saved snapshots, and reset explicitly clears it. Typecheck, lint, 32 focused tests, production build, and 390px menu/overflow browser checks pass. | Local IndexedDB audit entries are preview data and can be reset/imported; they are not tamper-proof evidence. The new SQL index and connected audit authorization/coverage have not been exercised against an isolated Supabase instance. | Apply migrations in staging, verify admin/non-admin access and trigger coverage, then test pagination at realistic audit volume. |
| 2026-09-24 | Locations, profile and QR follow-through | Applied Inter at the app root; imported the supplied regional/province/municipality catalog into a versioned SQL migration and a paginated API, with a reusable city picker in demo and connected project/warehouse/supplier forms. Project lists show city; detail views retain full location and photos. Added self-service profile name/phone/email/photo forms for demo and connected web, with private connected WebP avatar storage and auth-confirmed email changes. Added manager-only demo QR label generation, viewing and printing alongside the existing connected QR registry/print routes. Location, demo, auth, media and security unit tests, lint, typecheck, production build, and demo browser project/QR walkthrough pass. | The supplied barangay file contains only 100 rows and is not nationwide coverage. The source mislabels NCR's province as Sarangani; the import normalizes it to Metro Manila. New SQL/RLS/storage migrations and connected email/photo/QR flows remain unverified because Docker/Supabase is unavailable locally. Demo labels do not imply that scanning/receiving workflows are complete. | Apply migrations in isolated staging; verify geo lookup, project/warehouse/supplier writes, profile confirmation and private-avatar RLS, and QR printing across roles before live use. |
| 2026-09-24 | Role dashboard and control consistency | Standardized demo workforce, request, inventory and equipment search/action toolbars and primary-button sizing. Converted supplied no-data, no-items and no-notifications artwork to optimized WebP empty states, removed the source PNGs and `robots.txt`, and set no-index metadata for the private ERP. Expanded role-scoped dashboard metrics with data-derived status breakdowns in demo and the connected dashboard. Fixed demo daily-report creation for assigned project staff and restricted material quick-search to accessible stock. Typecheck, lint, demo/auth/media/security tests, production build, and mobile browser checks pass. | Manual source-level permission review only: the installed Codex Security scan package lacks its required desktop reference. Connected Supabase RLS and role-by-role mutation checks remain unverified in isolated staging. Demo personas are not live authentication. | Verify connected policies and workflows in staging, then review each role with real accounts before deployment. |
| 2026-09-24 | Dialog and notification UX | Added a reusable close button to demo add/edit/detail/confirmation dialogs and the connected profile dialog. Removed redundant workspace eyebrows, separated demo Project status from Recent activity, and replaced status bars with an accessible count-and-share donut. Notification popovers now have close controls, an 18px heading, 14px titles and 12px descriptions. Demo and connected notifications support marking all as unread; the connected migration preserves first-read audit events on repeated reads. Typecheck, lint, 32 demo tests, auth/security tests, production build, and mobile browser checks pass. | The connected notification migration and RLS behavior have not been exercised against isolated Supabase staging. | Apply the migration in staging and verify own-recipient read/unread transitions, audit history, realtime counts, and cross-user denial. |
| 2026-09-24 | Dashboard and narrow-screen refinement | Replaced the demo status chart with concise role-scoped ongoing-project and recent-request lists, retaining stock/report activity for roles without request access. Removed the connected dashboard chart and its redundant completed-project count query while keeping its real RLS-scoped project summary. Made notification popovers fit narrow screens and short viewports; subdued the sidebar divider and improved dark-mode metric icon contrast. Material requests and daily reports now use distinct icons. Typecheck, lint, demo tests, production build and mobile light/dark browser checks pass. | Connected material-request screens and recent-request data are not implemented, so the connected dashboard does not claim to show live requests. | Complete the approved connected request workflow before adding its live dashboard feed; validate responsive layouts with the client. |
| 2026-09-24 | Connected material request intake and decision (unapplied) | Added normalized multi-line material requests, idempotent submission/decision commands, manager approval with partial quantities/reasons, project-scoped RLS, request history, searchable/paginated web list, submission and decision screens, a role-visible recent-request dashboard feed, and administrator-only direct stock-out exceptions. Domain tests, typecheck, lint and build pass. | Migration is deliberately unapplied because no isolated staging project exists and local Docker is stopped. No request-bound dispatch/receipt, weighted-average valuation, site consumption/costing, warehouse pick queue, or business-triggered notice is claimed. Database/RLS/concurrency tests remain mandatory. | Provision isolated staging, apply migrations and test roles/retries; then implement request-bound dispatch/receipt and approved valuation before project costing. |
| 2026-09-24 | Request fulfillment continuation (unapplied) | Added an assigned-warehouse pick queue, request-bound atomic dispatch and partial site receipt commands, payload-checked idempotency, in-transit quantities and history links, and scoped web controls. Generic receipt/reversal cannot silently mutate request-bound transfers; unlinked site dispatch requires an administrator and a reason. Domain tests, typecheck, lint and build pass. | Migration remains unapplied by agreement; database/RLS/concurrency and real-role browser tests are pending. No admin variance resolution, opening-value reconciliation, weighted-average valuation, consumption costing, invoice/payment ledger or other Package 3 workflows are claimed. | Provision isolated staging, apply ordered migrations and verify the fulfillment invariants in `docs/phase3c-request-fulfillment.md`; then build the admin variance and valuation/consumption slices. |
| 2026-09-24 | Inventory valuation and transit variance continuation (unapplied) | Added verified opening quantity/value per warehouse SKU, explicit-cost stock-in, atomic weighted-average cost snapshots on movements and site consumption, project material-cost readout, admin-approved transit variance, cost-reconciling partial receipts, and protective blocks on unsafe reversals. Domain tests, typecheck, lint and build pass. See `docs/phase3d-valuation-variance.md`. | Both migrations remain unapplied; SQL/RLS/concurrency and real-role browser tests have **not** run. Existing site/in-transit stock, PO-linked landed costs, returns/corrections, invoices/payments, labor/equipment costing and P&L are not complete. This is not a deployable Package 3 ERP. | Provision isolated staging, apply migrations in order, reconcile opening stock and execute the documented accounting/authorization test matrix before any live posting. |
| 2026-09-24 | Connected web workflow continuation (unapplied) | Coded multi-line POs and costed partial receipts, site returns, documented legacy transit/site opening valuation, attendance/rate-snapshot labor cost, equipment use/rate cost, budget deltas, additional expenses, invoices/partial payments and a management billed-margin summary. Typecheck, lint, domain tests and web build pass; see `docs/connected-web-workflows-2026-09-24.md`. | No database/staging execution, RLS or concurrent-posting verification. Real opening values are missing. Management project-profit policy and approved damaged/lost-on-hand corrections remain open; PDF/XLSX export was added later. Supplier credits and invoice/PO matching are optional unless separately agreed. No production deployment. | Provision isolated staging, apply full ordered migration chain, run finance/inventory concurrency and role tests, reconcile company data and confirm finance policies before marking checkboxes complete. |
| 2026-09-24 | Warehouse retirement safeguard (unapplied) | Added an edit-form explanation and a database guard for stock, in-flight transfers and open POs; new stock/transfer/PO writes lock the warehouse row so retirement cannot race them. Typecheck, lint and build pass. | The migration and concurrency/role tests remain unapplied without isolated staging. Existing demo warehouses do not expose an inactive status. | Run the warehouse retirement matrix in `docs/connected-web-workflows-2026-09-24.md` before live use. |
| 2026-09-24 | Settings/dashboard typography and release audit | Standardized demo and connected profile/settings controls to 14px, kept profile role text at 12px, and made ongoing-project and recent-request panels size independently. Browser checks at desktop and 390px, all available unit tests, typecheck, lint, production build and production-dependency audit pass. See `docs/web-release-readiness.md`. | UI review does not close the connected release gate: migrations/RLS have not run in staging, Package 3 financial/operational workflows remain incomplete, and backup/monitoring/UAT are outstanding. | Keep the local demo for presentation; provision isolated staging and execute the documented database and role test matrix before planning a live deployment. |
| 2026-09-24 | Daily-report date range and equipment custody (unapplied) | Added an accessible start/end calendar filter beside Add report in demo and connected daily reports, with right-edge popover alignment; lightened sidebar label weight. Added project-scoped engineer/foreman/manager equipment requests, admin approval/rejection, withdrawal of unfulfilled approval, exclusive checkout and audited return to the source location with optional maintenance status. Equipment usage and cost posting remain separate. Local demo previews request, approval, checkout and return with role checks, custody state, audit entries and import/export preservation. The migration also rejects active assets in inactive warehouses. Typecheck, lint, demo tests and production build pass. | The new custody migration, role policies and handover concurrency behavior remain unapplied and untested in a database. Demo source selection is illustrative and does not enforce connected project-warehouse assignment. Do not deploy this workflow. | Apply ordered migrations in isolated staging, test role isolation, competing approvals, custody-return guard and cost separation; then run responsive and real-account UAT. |
| 2026-09-25 | Project plan, progress, count and profit web slice (unapplied) | Coded per-site/SKU material plans with stock/request/shortage calculation and prefilled request/PO forms; approved-report-linked dated progress; physical counts with admin-approved, valued shortage posting; and provisional contract-minus-posted-cost profit including site count and project transfer losses. Added responsive pages/forms, shared validation and PDF/XLSX updates. Typecheck, lint, build, domain tests and SQL parsing pass. | The ordered migrations, RLS, concurrency, real-role browser flows and opening values remain untested without isolated staging. Surplus counts require an explicitly costed receipt. The local demo does not yet preview these new connected workflows. No production deployment claim. | Test migration chain, role denials, concurrent stock changes, count retries/reversals and profit reconciliation in staging; then align demo preview and run responsive UAT. |
| 2026-09-25 | Supplier photos and equipment navigation (unapplied) | Added optional supplier WebP photos to the connected supplier form, table and detail; private Storage access and a role-checked attach command are in a new migration. The demo stores optional supplier photos locally and uses a neutral store icon when missing. View/Edit/Archive actions now have icons; equipment handovers are separate from the demo equipment registry and visible as their own route in both sidebars. Typecheck, lint, 35 demo tests, build and SQL syntax parsing pass. | The photo migration and its RLS/storage policies have not been applied or exercised in isolated staging. Demo supplier deletion remains local-only; connected supplier history is preserved through archiving. | Apply the ordered migrations in staging, verify photo upload/read/replace and authorization across roles, and run a handover walkthrough before production use. |
| 2026-09-25 | Material-request presentation and requester role | Replaced the demo's dense request cards and inline history with a photo-backed, paginated table and a structured detail dialog for quantities and events. Connected request lists/details now show material thumbnails and tabular history. New requests are restricted to assigned project-manager/engineer/foreman accounts in the demo, connected UI/server action, and an unapplied database trigger; administrators retain review/approval. Typecheck, lint, demo tests, build and SQL syntax parsing pass, with an admin/browser preview check. | Database role enforcement is not verified until the ordered migrations run in isolated staging. Existing requests authored by administrators remain historical records. | In staging, confirm direct RPC admin denial, assigned staff submission, manager decision and warehouse/site handoff; then run narrow-screen UAT. |
| 2026-09-25 | Web/demo parity audit follow-through | Connected supplier detail now lists linked purchase orders and receipt counts instead of a permanent empty placeholder. Its equipment detail shows finance-authorized posted usage alongside registry events. The demo now seeds a selectable worker account linked to an employee and personal attendance, adds append-only supplier quotes with the cement ₱100→₱120 example, and shows asset-specific audit/handover history. Typecheck, lint, demo tests and build pass; supplier and worker preview screens were browser-checked. | This is not full Package 3 demo parity: local PO/receipt, stock count, progress/profit, billing, and detailed labor/equipment costing are still absent. Connected migrations/RLS/concurrency and real-account flows remain unapplied/unverified without isolated staging. | Complete remaining local preview workflows as coherent vertical slices; then apply and test ordered migrations in isolated staging before production acceptance. |
| 2026-09-25 | Table actions and project-plan preview | One or two row actions now render as labeled semantic icons; three or more use the shared three-dot menu. Reference tables and equipment handover actions use the same treatment. The local project modal has an editable, role-scoped material plan with site need/source gap and a request prefill. The plan is non-posting and audited. Typecheck, lint, production build and 39 demo tests pass; admin and engineer browser flows were checked. | The demo still lacks PO/receipt, stock-count, finance, labor-rate and equipment-usage posting parity. Reusable-material custody and explicit daily-report links to posted resources remain scope gaps. Connected migrations remain unapplied and database/RLS acceptance blocked by missing isolated staging. | See [web scope coverage](docs/web-scope-coverage-2026-09-25.md). Complete remaining web slices, then validate with a disposable staging database before release. |
| 2026-09-25 | README feature audit | Marked all 16 confirmed-needs checkboxes in place as partial or coded/unverified with row-by-row evidence; split the Phase 2 seed task and checked only its tested local-demo portion. Typecheck, lint, build, demo/auth/media/security/domain tests and a read-only project-plan browser smoke check pass. | Connected concurrency/reservation scripts could not start without local Supabase credentials; Docker database engine is stopped. PR, reusable custody, daily-report posting links and several demo flows are incomplete. Migrations/RLS, real-role UAT and opening-value reconciliation remain unverified. | Complete missing web slices, then apply migrations and run the README §17 acceptance matrix in isolated staging before checking connected features. |
| 2026-09-25 | Project detail tabs and preview | Split the local project detail into URL-backed Overview, Sites, Labour, Materials, Finance and Documents sections. Added attendance-based wage distribution, planned-material coverage by each item's unit, and modal add/edit for material plans; kept finance role-gated and demo wage totals explicitly non-posting. Typecheck, lint, demo tests, build and desktop browser tab/dialog checks pass. | Connected project screens and wage posting were not changed; the migrations and real-role/RLS tests still require isolated staging. | Review the narrow-screen tab layout with the client; verify connected project/finance workflows after staging is available. |
| 2026-09-26 | Attendance preview workflow | Added a dedicated local Attendance screen with dated worker/project/site list, project/site/trade/status filters, responsive status metrics, assignment and manager posting dialogs, CSV, rate-and-cost snapshots, 24-hour/duplicate guards, append-only reasoned reversals and project labor totals. Added a connected, paginated attendance review page and project posting dialog. Demo tests, typecheck, lint, production build and narrow-browser form/filter checks pass. | The connected attendance command and RLS remain unapplied and database-untested. No foreman submission/manager approval, leave or overtime-pay policy has been implemented; broad labor acceptance remains partial. Existing local legacy attendance stays uncosted until corrected. | Apply ordered migrations in isolated staging; test admin/accounting/foreman/worker access, rate changes, duplicate retries and reversal totals with real accounts before treating the connected workflow as ready. |
| 2026-09-26 | Inventory and wage presentation | Replaced the demo and connected inventory balance tables with responsive material cards showing actual on-hand, reserved, available and minimum values where modeled; retained location filtering, detail, export and role-scoped actions. Added a custom material-unit picker with common construction base units, including metric tons, and an unapplied reference-unit migration. Demo and connected wage entry now display ₱ and group thousands; legacy demo attendance shows the current wage as unposted, never as a historical cost snapshot. | The new unit migration is unapplied and its connected picker cannot show those added units until staging applies it. Unit conversions and inventory valuation were not changed. Existing connected database/RLS checks remain open. | Apply ordered migrations in staging, verify UOM choices and material writes with real roles, and test inventory cards at warehouse/site and narrow widths. |
| 2026-09-26 | Directory card presentation | Converted demo warehouse and supplier lists and the connected supplier list to responsive cards using existing record photos, real counts, and the same view/edit/archive actions. Removed divider rules inside inventory balance cards. Typecheck, lint, 44 demo tests, build and narrow demo browser checks pass. | Connected supplier and warehouse pages still need real-account/staging visual and permission checks; no database workflow changed. | Validate the connected cards with staged records and role-scoped actions before release. |
| 2026-09-26 | Connected staging preview transition | Retired the browser-only IndexedDB demo route and source. Local legacy mode now shows a staging-setup page. Added an opt-in staging-only server-side test-account switcher after real login, removed predictable seed passwords and added a guarded staging provision command. Connected inventory location selection moved above the cards, supplier filters use shared controls, progress input is bounded to 0–100, and the dashboard has finance-scoped monthly posted costs, recent consumption and real audit activity. Typecheck, lint, build and available unit tests pass. | No isolated staging project exists: the new monthly-cost migration, seed, test-account provisioning, audit samples and all connected role/workflow checks remain unapplied/unverified. Old dated demo progress entries above are historical only. | Provision isolated staging, apply all migrations and seed, rotate test passwords, then run end-to-end role/RLS and valuation acceptance before production release. |

---

## 19. Commercial and change control checklist

- [ ] Confirm exact client legal/business name and authorized signatory.
- [ ] Confirm whether ₱120,000+ starting quote includes all agreed tasks, and document any approved exclusions/changes.
- [ ] Confirm formal payment schedule (the 50/50 terms were proposed, not proven accepted).
- [ ] Agree dated milestones and how scope change affects cost/delivery.
- [ ] Agree included cloud tiers, hosting/domain, email/SMS, storage, maps, and Apple/Google store fees: third-party charges are excluded from original quote.
- [ ] Confirm IP/source-code transfer, license use, access ownership and credential handover.
- [ ] Confirm deployment/UAT acceptance owner and bug-fix warranty (Package 3 quote: six months, scope to define).
- [ ] Maintain signed change requests for new features, architecture changes and accounting policies.

**Rule for developers and AI agents:** This README is a product blueprint, not permission to claim that unbuilt features exist, incur paid services, deploy to production, or expand the agreed commercial scope without approval.

### Web preview and daily-report photo follow-through (2026-09-24)

Project, warehouse, material, equipment, employee, and account names now open record-detail dialogs in the demo. Warehouse and daily-report seeds have illustrative WebP images; record upload fields remain editable. Request creation, result counts, and pagination controls are outside data tables, with a consistent 12px/14px header/body table scale. The shared calendar filters demo and connected daily reports. Connected daily-report photos use private WebP storage, a draft-only attachment RPC, and project-scoped read policies. Admin account profiles can show privately stored avatars. Typecheck, lint, demo tests, production build, and local preview interaction checks pass. The new migrations and live storage/RLS paths still require an isolated Supabase staging run and role-by-role verification before release.
