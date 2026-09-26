# Package 3 web ERP recheck — 2026-09-27

## Decision and evidence standard

**Not ready to certify for real operations.** The responsive web implementation covers much of the quoted scope, but implemented screens are not proof of working stock, permissions, uploads or money. No broad business feature is newly marked accepted in this audit.

This review checked the connected source, authoritative SQL commands and their subsequent migrations, role gates, data loaders, exports, realtime mappings and available automated tests. It also removed two unreferenced runtime files. It did **not** execute the ordered migration chain, authenticate four real test accounts, verify hosted Supabase/Storage/publication configuration, or complete an authenticated browser walkthrough. A bounded local Supabase container inspection timed out after 15 seconds. No company data or hosted schema was changed.

- **Coded / unverified:** connected implementation exists; database/browser acceptance remains necessary.
- **Partial:** a specific implementation limitation is identified, in addition to missing acceptance evidence.
- **Deferred:** native clients and deployment are excluded from this web recheck, not removed from the commercial package.

## Package 1 — each quoted web feature

| Feature | Status | Evidence reviewed and what still needs proving |
|---|---|---|
| Web dashboard | Coded / unverified | `src/lib/data/dashboard.ts`, `dashboard-consumption.ts` and dashboard UI: totals, projects/requests, expense charts, unit-aware consumption and recent activity. Reconcile totals against complete posted/reversed data and inspect responsive rendering with real accounts. |
| Project management | Coded / unverified | Project actions, domain validation, project list/detail/tabs, modal create/edit and progress commands. Verify create/edit/archive, date rules, private photos and denied access across projects. |
| Inventory management | Partial | `src/lib/data/inventory.ts` and inventory migrations: location balances, catalogue, valuation and history. Transfer history and several catalog/reference reads now traverse stable pages, but material and auxiliary loaders still require a large-data audit and database acceptance. |
| Material stock-in and stock-out | Coded / unverified | Purchase receipt and approved-request dispatch/receipt commands; transfer/ledger updates and request reservations. Execute retry, concurrent-release, insufficient-stock, partial receipt, transfer and reversal tests. Code-level locks are not concurrency-test results. |
| Material usage tracking per project | Coded / unverified | `consume_site_material`, project consumption history and report-resource links. Verify actual daily/site quantities and remaining balances without double charging transferred or report-linked stock. |
| Automatic material costing | Coded / unverified | Weighted-average valuation and consumption cost snapshots in `20260924200000_verified_inventory_valuation.sql` and subsequent cost migrations. Reconcile opening values, receipts, returns, consumption and reversals; never substitute current supplier prices for historical cost. |
| Basic sales management | Coded / unverified | Client invoices/payments, billing actions and `20260924210000_client_billing.sql`. Test issue/payment/retry/reversal/overpayment and outstanding-balance calculations. |
| Basic project reports | Partial | Project report tabs, daily reports, transaction/cost views and PDF/XLSX summary exports exist. Some detailed histories remain capped. A summary export is not a complete transaction export. |
| Admin and Staff accounts | Coded / unverified | `src/lib/auth.ts`, access tests, users and membership policies use Admin, Engineer, Foreman and Warehouse Staff only. Real-account onboarding, disabled-account and cross-project/location denial tests remain. |
| Real-time web/mobile synchronization | Partial (responsive web only) | `src/lib/realtime/route-sources.ts` now maps project, attendance, equipment usage, costs, billing and report links in addition to requests, stock, assets and notifications. The new RLS-guarded publication migration is unapplied; Foremen cannot receive private financial rows and receive periodic safe-view refresh instead. Live delivery with four accounts remains unverified. Native synchronization is deferred. |

Android application is deferred. Development, database setup, deployment assistance and support periods are delivery/service obligations, not features that a passing build can certify; deployment is outside this recheck.

## Package 2 — every additional feature

| Feature | Status | Evidence reviewed and what still needs proving |
|---|---|---|
| Advanced dashboard and analytics | Coded / unverified | Dashboard aggregate RPCs, monthly category expenses and material/unit consumption. Missing RPCs produce unavailable totals rather than fabricated values. Validate totals, role visibility, date boundaries and populated/empty graphs. |
| Project budget management | Coded / unverified | Initial/approved budgets, budget commands and project summary. Verify adjustments, authorization and posted-cost versus approved-budget reconciliation. |
| Detailed material costing per project | Partial | Authoritative consumption snapshots and project costs exist; detailed records/exports require complete pagination and reconciliation beyond current caps. |
| Supplier management | Partial | `src/lib/data/suppliers.ts`: supplier records, catalogue, historical quotes, current/previous price RPC and paginated event/purchase/price history. Comparison/catalog/reference reads now traverse pages, but populated-data performance and the summary-price RPC need acceptance. |
| Purchase order management | Coded / unverified | `src/lib/data/purchase-orders.ts`, order forms and receipt command. Simple purchase → receipt is retained; a separate purchase-request approval queue is not assumed. Verify issued price snapshots, changed receipt price/reason, partial receipts and concurrent retries. |
| Labor costing and worker expenses | Partial | Automatic assigned-Foreman attendance and historical rate/basis snapshots are coded. Daily full/half day, hourly hours and Admin-only wages/reversals are represented. Validate all database scenarios, active/archived assignment targets and large workforce totals. |
| Additional project expense tracking | Coded / unverified | Posted project expenses, reasoned reversals and cost ledger. Verify category totals, date/project permissions and retry behavior. A new expense-approval queue is not required by the agreed simple workflow. |
| Sales and client payment monitoring | Partial | Invoice balance RPC, payment commands and project finance views exist. Payment history and some billable-project/reference loaders need complete pagination; reconcile receipts independently from contract value and posted costs. |
| Project profit and loss reports | Coded / unverified | `20260924224000_project_profit_stock_losses.sql`: provisional contract minus posted costs; billing/cash/receivables separately reported. Validate material/labor/equipment/other/loss reversals and financial totals. This is not a formal accounting general ledger. |
| PDF and Excel report export | Partial | Project profitability summary exports generate PDF/XLSX; other CSV/QR exports exist. Equipment CSV now traverses every filtered asset page. Complete detailed report coverage and HTTP export beyond 500 records still need acceptance evidence. |
| Advanced user roles and permissions | Coded / unverified | Four-role server gates and SQL RLS/capability checks exist; Foreman attendance is wage-free. Test unauthorized direct RPC, exports, report links, storage and cross-project access, not just hidden buttons. |
| Material request and approval system | Coded / unverified | Request submission, assigned Engineer/Admin decisions, partial approvals, reservations, release and receipt commands. Test self-decision policy, approved quantities, retries and stock availability through all roles. |
| Low-stock notifications | Coded / unverified | `20260924218000_low_stock_alerts.sql`: threshold alerts, recovery, balance triggers and scheduled reconciliation. Verify recipients, deduplication, delivery worker/schedule and resolution in a real database. |

## Package 3 — every additional feature

| Feature | Status | Evidence reviewed and what still needs proving |
|---|---|---|
| Multi-project management | Coded / unverified | Project memberships, separate site locations, project costs/reports and lists. Test the same employees/materials across two permitted projects and denial on an unrelated project. |
| Multi-warehouse inventory | Coded / unverified | Location-scoped balances, warehouse assignment and transfers. Execute two-warehouse/site stock and value reconciliation with partial receipts/returns. |
| Advanced material request/approval workflow | Coded / unverified | Fixed assigned-Engineer/Admin decisions, partial quantities, reservations and fulfillment stages exist. An arbitrary workflow designer or new queues are not implied. Execute full approval-to-site-receipt and concurrent release tests. |
| Procurement and purchasing | Coded / unverified | Project shortage planning, supplier pricing, orders and valued receipts. Verify shortage → purchase → stock → project consumption without duplicate quantity/value. |
| Equipment and machinery tracking | Partial | `src/lib/data/assets.ts`, handover/return, asset events, rate snapshots and equipment usage cost commands. An assigned-Foreman hours form and rate-hidden atomic RPC are coded in an unapplied migration. Verify role denial, custody, availability, returns and daily hours/duplicate/cost controls in a database. |
| Employee and attendance management | Partial | Employees, assignments, rate history, costing basis and automatic Foreman attendance exist. No attendance approval step. The new active project/site/employee insert guard and expanded histories are coded but unapplied; historical rates, corrections and authorization still need database acceptance. |
| Project progress monitoring | Coded / unverified | Progress entries, 0–100 domain validation, history pagination and report-linked progress. Verify day/date rules, duplicate/retry behavior and accurate current progress, including no-data 0%. |
| Advanced financial and profitability reports | Partial | Budget/cost/provisional profitability summaries and finance tabs exist. Full filtered detail, export reconciliation and historical-cost acceptance remain. Do not describe this as audited/formal accounting. |
| Real-time notifications | Coded / unverified | Notification generation, recipient-scoped list/read commands, Bell subscriptions and operational realtime migration. Hosted publication, RLS, scheduled worker delivery and reconnect behavior remain unverified. |
| Audit logs and activity tracking | Coded / unverified | Append-only audit/event records, Admin paginated log UI with actor avatars, report-link change audits and recent dashboard activity. Verify command/reversal attribution and denial to unauthorized users. New resource-link/basis entity types are not all listed in the log's filter choices. |
| Advanced analytics dashboard | Coded / unverified | Same authoritative aggregate/dashboard/chart implementation as Package 2. No claim of independent additional analytics beyond those views; verify the client's acceptance examples against posted data. |

Android/iOS applications, deployment/server provisioning and six-month support are deferred/service obligations. They are not counted as accepted web features.

## Meeting-note cross-check

| Client need | Current interpretation / finding |
|---|---|
| Monitor every project's expenses and amount | Project budget, ledger, billing and provisional profitability are coded; end-to-end money reconciliation pending. |
| Cement is consumed by a project; remaining inventory | Consumable-only material posting with quantity/unit/cost snapshots; verify site balances and atomic consumption. |
| Fixed/reusable inventory, separate from materials | Reusable tools belong in Equipment custody/returns. Legacy reusable materials are read-only until Admin reconciliation; no automatic duplication or stock deletion. Bulk reusable quantities are not equivalent to individually registered assets. |
| Vehicles / sasakyan | Vehicle registry remains in scope and was not removed. GPS/fleet telematics is not assumed. |
| New project target days | Start/target/actual dates and duration/progress are present; verify date conflicts in connected forms. |
| Foreman daily requests, attendance, use | Assigned project request/report and automatic attendance code exists. Foremen do not edit wages. Equipment-hour entry is currently Admin-only; clarify/finish the intended daily operational path before acceptance. |
| History of request, release, receipt, consumption, return | Existing request/transfer/ledger/custody histories remain; some loader caps prevent claiming complete accessible history. |
| Labor rates and equipment hours/cost | Historical labor basis/rates and equipment rate snapshots exist; test full/half day, hourly, 24-hour limits, retries and reversals. |
| Supplier cement price 100 today, 120 tomorrow | Dated quotes and PO/receipt snapshots preserve historical prices in code. Prove earlier consumption/cost does not change after a later price update. |
| Check stock before buying missing materials | Project material plan/shortage helpers connect requests and purchasing; validate against reserved and available stock. |
| QR labels incorporated | Opaque registry/print/scanner and permission-scoped resolution are coded; test actual camera/manual lookup, label access and action completion. |
| Daily report and transactions | Typed links attach existing consumption/attendance/equipment records without posting a second movement/cost. Verify date/site/project validation, duplicate links, reversal labels and authorization. |
| Multiple warehouses / project-site stock | Implemented schema/commands; real stock/value and cross-location denial tests remain. |
| Bags, tons, pieces and other units | Units catalogue/common-units migration and material unit snapshots exist. Compare consumption only within the same unit; no unapproved automatic unit conversion. |

## Confirmed limitations and release gates

1. **Complete data access/export is unfinished.** Equipment CSV uses the default 500-asset loader ([route](../src/app/(workspace)/equipment/export/route.ts), [loader](../src/lib/data/assets.ts)). Inventory transfers/reference data, supplier catalogue/comparison, workforce assignments, invoice payment history and daily-report event history also retain hard caps or implicit API limits. Some lists lack a unique ordering tie-breaker. Page counts and financial RPC totals must not be confused with a complete detail/export dataset.
2. **Attendance target-state validation needs a dedicated check.** The current replacement `post_project_attendance` function in [the attendance migration](../supabase/migrations/20260927090000_automatic_foreman_attendance.sql) checks assignments/dates/rates/retries but does not itself check project archive/status, site active state or employee archive/status. This is a code finding, not a tested exploit: verify all effective policies/triggers and explicitly enforce the agreed active-target rules. Preserve historical valid entries and reasoned Admin corrections.
3. **Live coverage is incomplete.** [Route mappings](../src/lib/realtime/route-sources.ts) omit project routes and attendance/equipment-usage/report-link changes. Cached navigation and silent refresh code/tests are present; they do not prove live consistency or browser performance across two accounts. Realtime itself does not prevent overspending; database locking and atomic validation must do that.
4. **Equipment daily operation is not the same as attendance.** Equipment usage is currently Admin-posted. Decide/test how authorized site staff record hours without gaining rate control; no new approval queue is necessary by default.
5. **SQL/Storage acceptance is unverified.** Migration versions are now unique, but clean-chain application, both duplicate-version repair states, hosted history, upload policies, report links and role denials must run against an isolated verified test database. Do not reset company data or rewrite hosted migration history blindly.
6. **The financial lifecycle has not been demonstrated.** Complete purchase → receipt → request/approval → release/site receipt → consumption → labor/equipment/other costs → report links → billing/payment → profitability, with two concurrent releases and reversals. Reconcile quantities, valuations and cash separately.

These gates are requirements for acceptance, not permission to introduce extra payroll, GPS, supplier portals, arbitrary approval designers, offline-native sync or formal accounting modules.

## Checks and cleanup performed in this recheck

- TypeScript and ESLint: passed.
- Unit/security/domain/navigation/media/list tests: **52 passed**, zero failures or skips. `npm run test:all` now runs the complete current unit test set rather than requiring many separate commands.
- Migration-version validation: **60 unique versions**, passed. This does not validate SQL execution or repair behavior.
- Production build: passed (`npm run build`), including compilation, TypeScript and route generation.
- Database integration, hosted behavior, authenticated browser UAT and upload verification: **not run / not accepted**; local container inspection timed out. Existing integration fixtures are retained for those checks.
- Removed `src/lib/inventory/unit-options.ts` (unreferenced retired demo units) and `src/components/ui/registry-toolbar.tsx` (unreferenced replaced toolbar), after import/reference checks. Removed the unused demo prop/message from the project share button. Deletions are recoverable from Git.
- Kept migration files, seed/setup SQL and test scripts that support ordered deployment, history, fixtures or acceptance. Superseded migration definitions are historical deployment dependencies, not automatically dead SQL. Static import checks did not establish any other runtime module as safe to remove; framework entry files were preserved.

The audit/cleanup is complete once its listed code checks pass. **The ERP's operational acceptance is not complete** until the release gates above are resolved and demonstrated; README business checkboxes therefore stay unchecked.
