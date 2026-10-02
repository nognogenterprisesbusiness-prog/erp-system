# Construction ERP role and workflow review — 2026-10-03

Implementation follow-up: the authorized permission, correction, usability and pagination repairs are now in local code. The real PostgreSQL five-role suite passes; isolated Supabase service acceptance is still blocked by missing Docker. See [current implementation evidence](erp-workflow-implementation-2026-10-03.md). The findings below retain the original pre-repair review evidence.

The five-role structure and central construction workflow are broadly appropriate for the approved operational ERP. The current implementation is **not fully correct or ready for operational acceptance**. Permission mismatches, inaccessible corrections and incomplete large-data choices remain. It also does not implement a complete accounting ERP, which the approved scope does not require.

## Scope and evidence

Reviewed `nognog-enterprises`: current web role gates/navigation, shared domain contracts, mutation entry points, database migrations and effective replacements, loaders, available tests, and mobile command authorization at its web API boundary. This is a source-level business-logic review with selected isolated PostgreSQL reproductions, not an exhaustive security scan or authenticated browser/device acceptance.

The workspace includes several other projects. This report concerns the Nognog construction ERP, not the Halara POS or RentQo. The supplied instruction mentions both Sprint 1 and Sprint 2; no separate matching sprint requirements were found here. The repository's README decisions and AGENTS.md define the business baseline. No new business policy was invented or implemented.

No company database, hosted schema, business data or application behavior was changed. Temporary reproduction scripts were removed after execution. This report is the review deliverable.

## Role assessment

| Role | Current responsibility | Assessment |
|---|---|---|
| Admin | Users, projects/sites/assignments, catalogs, suppliers/POs, rates/budgets, asset handovers, exception posting and financial corrections | Fits the approved small-business model. Broad authority is intentional; independent approval of every Admin action is not implemented. Posted stock corrections are incomplete. |
| Engineer | Assigned project/site operations, requests, material receipt/use, reports; independent material decisions and report review | Appropriate responsibility, but site-only assignment is inconsistent with approval/progress commands. Engineers cannot record attendance or equipment hours; those are Foreman/Admin duties under the current design. |
| Foreman | Assigned project/site requests, receipts, consumption, reports, automatic attendance and equipment/vehicle hours without wage/rate editing | Appropriate separation of operations and financial rates. Receipt authorization is too broad at the direct database command boundary. Site-only document access is missing. |
| Warehouse Staff | Assigned warehouses, approved material release, purchase delivery quantities at Admin-issued PO price | Appropriate. Isolated receipt tests verify warehouse scope, hidden prices and denial of price overrides. Equipment handover/return remains Admin-only by the existing policy, not a Warehouse Staff feature. |
| Finance | Company-wide financial/project/workforce reads, issue client invoices and record partial payments; no procurement, rates/budgets, invoice voids or payment reversals | Reasonable approved separation. Company-wide finance visibility is intentional. Project attendance detail has a web gate mismatch, even though the global attendance page and financial tables support Finance. |

## Findings, in priority order

### F01 — High: request receipt authorizes the project rather than the receiving site

The effective retained receipt core in `20260927160000_repair_request_receipt_access.sql:83` checks `can_view_material_request_project(project_id)`. Its latest helper in `20260928110000_site-scoped-foreman-access.sql:160` accepts anyone who can view the project through an assigned site. It does not check the request's `project_site_id` before updating destination stock.

Example: a Foreman assigned only to Site A can pass the receipt command's project authorization for a delivery to Site B in the same project, despite failing Site B's site-access helper. The command is `SECURITY DEFINER`; hidden rows/buttons and the mobile HTTP site's additional check do not replace authorization inside the directly callable RPC.

**Evidence:** isolated execution of the actual effective authorization helpers returned `Site-B access=false` and `receipt-core project access=true` for a Site-A-only Foreman. The stock-writing core and public wrappers were traced in source. A complete authenticated Supabase cross-site receipt was not executed.

**Required correction:** validate the actual request project/site and destination inside the trusted receipt command, including retry behavior after assignment revocation. Prove denial for a sibling site and an unrelated project through direct RPC as well as web/mobile.

### F02 — High: operational corrections are offered but cannot complete

`src/app/(workspace)/inventory/transactions/page.tsx:15` offers Reverse on any visible original non-reversal transaction. The effective public reversal chain ultimately reaches the original core in `20260922110000_phase3a_material_inventory.sql:376`:

- `MATERIAL_CONSUMPTION` falls through to the unsupported phase-specific workflow error at line 394.
- The current batch valuation trigger in `20261001100000_latest_batch_costing.sql:224` rejects valued stock-in and transfer receipt reversals.
- The request-fulfillment wrapper in `20260924190000_request_fulfillment.sql:94` rejects request-bound movements and requires a dedicated correction workflow.

No usable corresponding material-consumption or PO/request receipt correction command was found in the current source. An incorrect consumption can therefore leave project cost overstated; an incorrect receipt cannot be corrected through the offered Reverse flow.

**Evidence:** loaded the real public reversal wrapper chain into the existing isolated PGlite receipt fixture. A PO receipt reversal was rejected by the valuation trigger; stock and PO totals remained unchanged through atomic rollback. A material-consumption reversal was rejected by the actual core. The batch suite's successful consumption reversal uses `t_reverse` in `scripts/batch-costing-fixture.sql:118`, not this production RPC.

**Required correction:** provide explicit, atomic and reasoned compensating commands that reconcile stock, exact batches, PO/request fulfillment and project cost. Restrict the UI to genuinely supported corrections. Test the production entry points rather than only ledger-trigger helper inserts. Do not allow a generic reversal to bypass those safeguards.

### F03 — Medium: site-only Engineers cannot perform advertised reviews

Site-only Engineers are deliberately supported by the site access helper and mobile capability model. However:

- `decide_material_request` requires an active project-wide Engineer assignment (`20260924180000_material_request_intake.sql:262`).
- `review_daily_report` has the same project-wide requirement (`20260924221000_daily_report_review_workflow.sql:24`).
- `record_project_progress` also requires that assignment (`20260924222000_project_plan_progress_profit.sql:146`).
- The web report detail repeats the project-wide check, while mobile reports per-site `can_review` capabilities.

**Evidence:** a site-assigned Engineer passed the real site helper but was denied by the actual report-review RPC in isolated PostgreSQL. Material approval and progress mismatches are source-confirmed; their complete transactions were not reproduced.

**Required correction:** make capability responses, web controls and database commands use the same approved Engineer scope. Preserve independent review/self-approval restrictions and deny reviews of another site unless a project-wide assignment explicitly permits them.

### F04 — Medium: site-only staff can open a project but cannot read its documents

Projects use `can_view_assigned_project`, which includes site assignments. Document row and Storage read policies still use the narrower `can_access_project` (`20260929180000_project_documents.sql:36,71`), which accepts Admin or project-wide membership only. The later document-management migration changes Admin edits/deletes, not this read scope.

**Evidence:** actual helper execution for a site-only Foreman produced project visibility=true and document project access=false. The project page exposes its Documents tab to site staff; document and download policies use the denying helper.

**Required correction:** align project-document visibility and file download policies with the approved document audience. Confirm whether all project-level documents are intended for every assigned site, or whether some document categories need narrower visibility before widening reads.

### F05 — Medium: site inspection can be bypassed through the old receipt RPC

The new `receive_request_transfer_with_inspection` validates the condition/note and records an inspection hash. `20260930104000_material_delivery_checks.sql:178` revokes the old dispatch RPC, but leaves the old `receive_request_transfer` grant from `20260924201000_transfer_variance_approval.sql:229` callable by authenticated users.

Calling that older receipt directly posts stock and creates a default accepted record through the new receipt trigger, without an explicit inspection decision. The normal web/mobile flow uses the new wrapper, but the database boundary does not require it.

**Evidence:** effective grants, trigger and wrapper traced in source; no live inspection-bypass transaction executed.

**Required correction:** if explicit receiving inspection is a required control, expose only the inspected public command and retain the underlying receipt implementation as a private callable core. Preserve any legitimate callers and retry semantics. Test direct old-RPC denial.

### F06 — Medium: some operational choices silently stop at 500 records

The effective warehouse receiving choices have `limit 500` without paging (`20261001130000_fix_receivable_po_supplier_name.sql:29`). Billable projects also stop at 500 (`20260930101000_finance_permissions.sql:190`); delivery vehicle choices do likewise (`20260930104000_material_delivery_checks.sql:83`).

Once a warehouse has more than 500 open PO lines, later valid deliveries cannot be selected through that receiving page. Counts and separately paged histories do not resolve a capped command picker.

**Required correction:** use stable, searchable paging for these choices and test a record beyond the first page. Size this against the approved volume decision D15. A bounded page is fine; an undocumented, inaccessible remainder is not.

### F07 — Low: attendance navigation and detail gates disagree with role capabilities

The sidebar's `/attendance` item is visible to all roles (`workspace-shell.tsx:32`), but its page calls `requireFinanceViewer` (`attendance/page.tsx:23`). Engineer, Foreman and Warehouse Staff therefore get an inaccessible destination. Foremen do have an operational attendance path inside assigned projects.

Conversely, Finance can read global attendance and attendance costs, but `/projects/[id]/attendance/page.tsx:26–28` permits only Engineer/Foreman in its non-Admin branch and rejects Finance.

**Required correction:** expose a suitable attendance destination by capability and support Finance's read-only project detail consistently. Keep wage-free operational views separate from financial views.

## Feature assessment

“Aligned” below means the inspected design fits the approved workflow; it does not mean live acceptance passed.

| Feature area | Assessment | Remaining proof or limitation |
|---|---|---|
| Login, onboarding, invitations, account deactivation | Aligned design: active-role checks and Admin account management | Real invite/recovery delivery, old-session revocation and direct database denial for inactive/onboarding accounts |
| Projects, sites, personnel and warehouses | Assignment-based read scopes and Admin mutations fit the scope | Site/project scope inconsistencies in F01, F03 and F04; archived/inactive transitions with outstanding work |
| Material catalogs and units | Consumables separated from reusable assets; quantities use explicit unit precision | Large-data references and legacy reusable-material reconciliation |
| Requests, approvals and reservations | Approval reserves available stock without reducing on-hand; requester cannot independently approve own request | Site-only Engineer decisions, concurrent reservation/release and lifecycle acceptance |
| Missing-material sourcing | Staff reports shortages; Admin maps to active, available catalog stock | Complete shortage → purchase → warehouse receipt → new request flow with real accounts |
| Stock release, transit and site receipt | Distinct source, transit and destination movements; partial quantities represented | F01, F02 and F05; real concurrent sessions and quantity/value conservation |
| Consumption and material costing | Consumption posts project cost; received purchase batches preserve historical costs | Production correction path F02; real concurrency and hosted backfill reconciliation |
| Returns, counts and losses | Audited stock/site returns and Admin-approved shortages are modeled separately | Partial return/loss corrections, reserved-stock limits and operational acceptance |
| Suppliers, price history and purchase orders | Admin issues PO price snapshots; Warehouse Staff receives quantities without changing cost | F02/F06; current rules do not include supplier credits or purchase-invoice matching |
| Equipment and vehicles | Separate custody/request/return lifecycle, snapshotted hourly rates, two-photo usage | Actual handover/use/return with multiple sites, photo retry failures, corrections and device acceptance |
| Employees, workforce and attendance | Versioned rates, wage-free Foreman posting, Admin reversals | F07; allocation of daily full/half-day cost across projects must be decided/tested |
| Daily reports and resource links | Independent review; links existing resources rather than posting costs twice | F03; submission/correction/relink races and role-by-role acceptance |
| Material planning and project progress | Plans distinguish use, site stock, outstanding requests and warehouse availability; progress tied to approved reports | F03; latest site report percentage is displayed as project completion—confirm whether multi-site projects require weighted aggregation |
| Budgets, expenses and profitability | Cost snapshots/reversals; invoices, cash and contract-value estimates kept separate | Management margin is provisional; full cost/cash reconciliation and correction coverage pending |
| Client invoices and payments | Invoice contract limit, partial-payment outstanding limit and locked/idempotent commands | Concurrent billing/payments, reversal/void acceptance and period/date policy |
| Documents and media | Private buckets, guarded uploads/downloads and Admin document management | F04; upload/download/deletion failures and orphan cleanup acceptance |
| QR identification | Identifies records and keeps authorization checks; Admin label management | Real scan/label/role walkthrough; QR is not a posting authorization |
| Notifications and Realtime | Recipient-scoped delivery/outbox and route refresh design | Real publication/Storage configuration, reconnect, delivery retries and Finance notification coverage |
| Audit logs, dashboards and exports | Posted records and corrections have audit/reference structures; server financial aggregates and paged exports exist | End-to-end attribution, complete exports, date consistency, aggregate/detail reconciliation and large-data coverage |
| Foreman/Engineer mobile API | Explicit bearer authentication, operational response contracts and site checks | This review did not run the separate native app checks or device UAT; API checks do not repair direct RPC gaps |

## ERP benchmark and business decisions

There is no universal required role list for an ERP. The approved five roles are suitable for a construction operations system. Larger ERP products explicitly control conflicting duties across users/roles; this app's broad Admin powers and Finance ability to issue invoices and collect payments are an approved simpler model, not equivalent to independently controlled accounting duties. See [Microsoft segregation-of-duties guidance](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/sysadmin/identify-resolve-conflicts-segregation-duties). Additional approval layers require a business decision, not automatic implementation.

The distinct in-transit shipment/receipt model fits established inventory practice ([Oracle transfer types](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/famml/transfer-types.html)). Charging project materials at actual site consumption also fits the approved construction costing model; purchases/dispatches must not be charged again.

The client's newest-purchase-first batch costing is an explicit approved management rule and its arithmetic tests pass. It should not be described as IFRS inventory valuation: IAS 2 specifies FIFO or weighted average for ordinarily interchangeable inventory ([IFRS Foundation IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)). Any statutory accounting valuation needs a separately approved accounting policy.

Supplier invoice matching, supplier credits, accounts payable, general ledger, accounting periods, tax and formal revenue recognition are not implemented as a full financial ERP. For comparison, conventional three-way matching compares the supplier invoice, PO and goods receipt ([Microsoft invoice matching](https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/accounts-payable-invoice-matching)). The README expressly excludes purchase-invoice matching and formal accounting unless approved; these omissions are scope boundaries, not defects to fix silently.

Two unresolved operational decisions deserve explicit acceptance examples:

1. **Daily labor allocated across projects (D09):** attendance checks one employee/project/date and total hours ≤24, but does not cap daily paid fractions across projects. Full-day postings on two projects can charge two daily rates. Decide how full/half days and split-project allocations should reconcile before adding a global rule.
2. **Project completion across multiple sites:** progress comes from dated site reports; project overview uses the latest visible progress entry. Confirm whether this is deliberately a project-wide percentage or should aggregate weighted site progress. The current number is not automatically a multi-site roll-up.

The old `docs/permissions.md` still describes retired role names and deferred/demo workflows. Update it from the final approved five-role matrix after scope fixes so acceptance testers do not rely on contradictory instructions.

## Verification performed now

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:all` | 67 passed, zero failures |
| `npm run test:migrations` | 90 unique migration versions; does not prove migration execution |
| `npm run test:batch-costing` | 25 isolated PostgreSQL scenarios passed; helper posting paths and simplified auth fixture |
| `npm run test:warehouse-receipts` | 12 isolated PostgreSQL checks passed; simplified role/warehouse fixture |
| Extra isolated correction checks using actual reversal RPC chain | Consumption correction rejected; valued PO receipt correction rejected with atomic rollback |
| Extra isolated checks using effective access helpers/report review RPC | Cross-site receipt capability mismatch, site-only document denial and site-only Engineer review denial reproduced |
| Real PostgreSQL concurrency, full ordered Supabase migrations/RLS, Storage, authenticated UI/device acceptance | Not run: `docker` command unavailable in this environment |
| Production build | Not run for this review; no application code changed |

## Acceptance order

1. Repair and directly test receiving-site authorization and required inspection enforcement.
2. Make scope capabilities consistent for Engineer review, documents and attendance navigation.
3. Finish supported stock/consumption corrections with ledger, batches, PO/request state and cost reconciliation.
4. Resolve paid-day allocation/progress interpretation and complete operational picker paging.
5. Apply all migrations to a disposable Supabase database. Run Admin, Engineer, Foreman, Warehouse Staff, Finance, inactive and anonymous positive/negative cases, including sibling sites.
6. Run purchase → warehouse receipt → request → independent approval → dispatch → partial/full site receipt → consumption → attendance/equipment/other expense → linked report → invoice/partial payment → corrections. Reconcile quantity, stock value, project cost and cash separately; add concurrent and changed-payload retries.
7. Complete responsive web and actual mobile-device acceptance before marking broad README checkboxes accepted.
