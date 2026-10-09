# Package 3 system audit — 10 October 2026

The agreed ERP modules are connected in code, and the tested inventory, procurement, project costing and permission workflows pass. This is ready for another controlled acceptance round after the pending migrations and new mobile build. It is **not evidence of zero bugs, zero technical debt or completed turnover**. Native delivery, operating procedures and client acceptance still need evidence.

This review covers the web repository and its sibling `nognog-mobile`, the ordered database migrations, five roles, Package 1–3 features and the client's subsequent simplification instructions. The audit fixes preserve screen designs and the approved workflows. No hosted business records or schema were changed by this audit.

## Findings corrected

| Finding | Correction | Evidence |
|---|---|---|
| Web used Next 16.3.5 and Sharp 0.35.4 with current dependency advisories | Next and matching ESLint config pinned to 16.3.8; Sharp 0.35.5; transitive source-map-js patched | Web build, lint, unit tests; production dependency audit now zero advisories |
| Mobile's transitive shell-quote and source-map-js versions had advisories; SDK 57 modules needed compatible patches | Updated lockfile and ran Expo's SDK-compatible installation; retained SDK 57, now 57.0.27 | Expo Doctor 21/21, mobile tests/types/lint, Android and iOS bundle exports |
| Financial PDF replaced valid accented names and truncated by character count regardless of width | Preserve supported accented characters, normalize Unicode and fit the project heading to its printable width | `src/lib/export/pdf-text.test.ts`; Peña/Muñoz/Café and long-name regression |
| Web equipment request choices stopped at 300 assets | Removed the SQL cap; read stable API pages using asset code and ID | 305 eligible assets remain accessible; denied site and Finance calls stay restricted |
| Project material-cost details used a single API response | Read all stable pages using material code and ID | Existing paging tests cover more than 1,000 rows and failure on later pages; production types/build pass |
| Equipment's future-date guard used the server/caller calendar | Set the core equipment command's timezone to Asia/Manila, matching hardware receipt dates | Local real PostgreSQL validates the configuration and rejects tomorrow in the Philippine calendar |
| Eleven public illustrations remained from the retired demo | Removed the unreferenced `public/demo-*.webp` files | No filename references in tracked source, configuration, migrations, seed, scripts or documents; normal manual/error/empty-state images retained |
| Top-level documentation described superseded role, inventory and verification states as current | Added this current audit and linked historical documents to it | Earlier dated reports remain historical evidence; acceptance checkboxes were not broadly marked complete |

The PDF still uses its existing standard Latin font. Characters outside that font's repertoire use a safe replacement; full CJK/other-script font embedding remains a reporting limitation. No UI or new accounting feature was added.

## Package and client requirement coverage

“Implemented” below describes source and schema coverage. The verification column identifies actual evidence and its limits; it does not imply every device and production record was exercised.

| Requirement | Current implementation/source | Verification and limits |
|---|---|---|
| Web dashboard; advanced analytics | `/dashboard`, `src/lib/data/dashboard.ts`, monthly cost/consumption and dashboard totals RPCs | Five-role project counts tested; complete business-data visual acceptance still required |
| Projects, multi-project management, target dates | `/projects`, sites, assignments, project save commands | Site assignment, cross-site capabilities, >500 project references tested; client lifecycle acceptance remains |
| Inventory, stock-in/out, multi-warehouse | `/inventory`, location balances, transaction ledger and cost layers | Warehouse/site totals, reservations, dispatch, receipt, consumption, corrections and reconciliation tested |
| Material usage and automatic project costs | `/inventory/consume`, `get_project_material_cost`, project costing | Concurrent use cannot spend the same balance twice; snapshots and reversals reconcile |
| Basic sales; client billing and payment monitoring | `/billing`, invoices, partial collections, reversals | Invoice/collection totals, retry payloads and remaining contract limits tested; billing is required by the client's “billings per project” note |
| Budget and detailed project costing | `/projects/[id]/costs`, budget adjustments and profitability RPC | Concurrent budget reductions cannot go negative; initial budget is optional per client instruction |
| Suppliers, price history, purchase orders | `/suppliers`, prices, quotations, PO commands | Supplier quote immutability, latest-price history, scope links and PO cost snapshots tested |
| Labor costing and worker expenses | Employees, assignments, attendance, labor-rate snapshots; additional expenses | Wage-blind site access, Finance read, attendance posting and labor totals tested; this is cost tracking, not payroll processing |
| Extra project expenses | `post_project_additional_expense`, expense corrections | Concurrent retries, external reference uniqueness, reversals and project totals tested |
| Profit/loss and financial reports | Project management profitability; PDF/XLSX summaries | Contract less posted costs reconciles; invoices and cash remain separate. Formal recognized revenue, tax and a general ledger are outside the agreed scope |
| PDF and Excel export | Project summary exports and inventory/asset/QR CSV exports | PDF text regression, summary mapping and build pass; exports do not imply every history is available as a detailed XLSX workbook |
| Advanced roles and permissions | `docs/permissions.md`, fresh account checks, RLS, scoped commands | Authorized and denied paths exercised across Admin, Finance, Engineer, Foreman and Warehouse Staff |
| Material requests and approvals | `/requests`, independent Engineer review, reservation and release | Partial approvals, competing releases, retries, cross-site denial and cancellation rules tested |
| Low-stock and real-time notifications | Low-stock events, notification outbox/inbox, Realtime subscribers and mobile push integration | Code/SQL present; live Realtime, cron processing and native push delivery need operational acceptance |
| Advanced purchasing workflow | Optional request/quotation links; amount gate; supplier delivery inspection; receipt and payments | ₱50,000 boundary, Admin owner approval, partial inspections/receipts, payment retries and corrections tested |
| Equipment/machinery and vehicles | Free-text types, requests, custody/return, hours, rate snapshots, start/end photos | Loan/return guards, photo metadata checks, competing daily postings, historical rates and cross-site denial tested |
| Employees and attendance | Employee records, assigned-site attendance and cost summaries | Posting/retry/visibility tests pass; native batch and full on-device attendance acceptance still needed |
| Project progress | Daily report preparation, independent review, linked activity and progress | Engineer review/progress tests pass; report links reuse posted activity rather than charging twice |
| Audit logs/activity | Audit triggers, posting actor/reason, compensating corrections and `/audit-logs` | Immutable posted history and correction records tested; retention/backup procedure remains an operations gate |
| Android and iOS apps | SDK 57 companion for Foreman/Engineer; web for Admin/Finance/Warehouse | Both native bundles export; this audit did not create/install a new signed build or verify iOS distribution |
| Initial documents, QR and delivery traceability | Project documents, QR lookup, manifests/truck/driver/reference, inspected site receipt | Assignment-based document/Storage metadata access and receipt scope tested; physical scan/upload/device acceptance remains |
| Missing/zero-stock materials | Report inside Requests → Admin sourcing → inspected warehouse receipt → Engineer site request → dispatch/receipt | Partial sourcing and full shortage-to-site chain tested; Engineer chooses existing catalog materials and cannot create arbitrary catalog records |

## Correct stock and purchasing rules

1. Main Inventory defaults to **All warehouses** for warehouse-capable roles. Site-only staff use site stock. The explicit site and overall views remain scoped to the caller's permissions.
2. Request submission does not deduct stock. Approval reserves available stock. Warehouse dispatch deducts source on-hand; checked site receipt adds site on-hand. Recording actual use deducts site stock and posts the project material cost once.
3. Payment changes the payable/cash record; it does not prove goods arrived. Inspected PO receipt is the stock-in event.
4. The Engineer's already-bought hardware receipt is a separate, reviewed workflow. Admin/Finance approval adds that accepted purchase to site stock once. It does not automatically consume the materials.
5. At most ₱50,000, an Admin supplier-order submission issues immediately. Above ₱50,000, an active Admin approves as owner; Finance cannot bypass that gate. Quotes and request links remain optional as approved by the user.
6. An equipment/vehicle loan moves custody and availability; equipment hours post the approved rate snapshot. It is not a consumable quantity deduction.
7. Posted costs survive later price/rate edits. Audited reversals undo the original snapshot instead of overwriting history. Returning unused stock is distinct from reversing actual recorded use.

## Code and database cleanup assessment

The initial tracked runtime import graph contained **425 TypeScript/JavaScript files**, with **177 App Router/domain entry points**; all were reachable at file level. Root layouts, errors and not-found pages were included. This does not prove every exported symbol is used or that a reachable path has no defect.

The complete migrated disposable PostgreSQL schema contained **101 public tables**, all with RLS enabled, and **268 application functions** across public/private schemas. Nine tables have no direct client policies because they hold internal command receipts, outbox/push tokens or cost allocation/layers. They remain used by protected functions; absence of a direct screen is not evidence of an unused table.

Historical material/supplier/asset categories still have foreign-key references from their original records. Their retired management screens/commands do not imply that historical rows can be deleted. Employee categories remain an active employee-page feature. The legacy `save_material` is also still used by the pre-migration compatibility path; `get_project_management_summary` feeds profitability and attendance. These are not safe deletion candidates.

Old category/missing-material URLs intentionally redirect or remain compatibility entry points. Earlier migrations and fictional local test fixtures are retained to rebuild and verify the schema. Dropping tables or rewriting migrations solely to shorten the repository would risk lost history and broken upgrades. No hosted database objects were dropped.

Two unrelated, pre-existing local edits add a fourth SKU catalog tab to Inventory. They are **excluded from this audit's commits** and remain unresolved local work. The released Inventory has the approved Materials, Equipment and Vehicles tabs. A future SKU-tab decision should avoid reinstating the duplicate catalog navigation the client removed.

## Verification evidence

Commands run on this audit's final source:

- `npm run test:all`: **109 passing web/domain tests**.
- `npm run test:erp-workflow`: **42 passing real PostgreSQL workflow checks**, five roles, concurrent sessions, inspections, retry keys and stock/cost reconciliation.
- `npm run test:project-costs`: **12 passing real PostgreSQL cost/capacity checks**, evidence requirements, scope denial, rate snapshots, expense/budget concurrency and equipment choices beyond 300.
- `npm run test:migrations`: **115 unique ordered migration versions**.
- Web lint and production Next build/typechecking pass.
- Mobile tests: **18 passing**; types and lint pass; Expo Doctor **21/21**; both Android and iOS bundles export.
- Dependency checks: web production **0** advisories; full web tree **5 high**; mobile tree **29** (**18 high, 11 moderate, 0 critical**).

The PostgreSQL fixture applies the full migration chain and fictional seed in a unique disposable database. It supplies local Auth/Storage schema adapters and skips pg_cron's extension/job registration because that extension is absent from portable PostgreSQL. It exercises real SQL/RLS/transactions, but does not substitute for Supabase HTTP uploads, actual email, live Realtime, cron scheduling or physical phones.

Earlier authenticated hosted checks verified five-role read scope and inventory reconciliation without business writes. This audit did not repeat or broaden those into hosted transaction acceptance.

Remaining advisories include [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), URI decoding and UUID through the mobile dependency tree. The braces advisory lists no patched version. These are dependency-chain counts, not 29 independently demonstrated application vulnerabilities. Runtime reachability of all mobile advisories has not been established. npm's suggested Expo downgrade/Router major change was not applied; arbitrary overrides would not constitute a verified fix. Mobile dependency exposure remains a release review item.

## Pending release and turnover gates

1. Apply the pending category-retirement migration `20261010110000` if not already applied, then the new `20261010120000` equipment-choice migration and `20261010121000` Philippine equipment-date migration. They preserve function signatures and old clients; before application, the old equipment cap/date behavior remains.
2. Produce a **new signed native build** for these SDK/native module patches and the current operational source. This audit exported bundles only. Verify the exact installed Android/iOS build and device flows; a Git push does not update installed apps. Activate minimum-build requirements only once the replacement download is available.
3. Complete five-role client UAT in an isolated/clearly designated testing environment: actual document and receipt uploads, before/after equipment photos, QR scans, interruptions/retries, partial deliveries, corrections, stock cards, project costs and partial invoice payments.
4. Verify live notification cron/outbox processing, two-client Realtime refresh and Android/iOS push delivery. Verify invite/recovery email to real deliverable staff addresses.
5. Reconcile actual opening stock, cost layers, supplier balances, worker/equipment rates and unpaid invoices. Fictional test reconciliation does not certify client opening records.
6. Confirm service/account ownership, backup retention and a restore rehearsal, monitoring/escalation, privacy/file retention and the Package 3 six-month bug-fix support handover.
7. Resolve remaining mobile advisory exposure and platform distribution evidence. Do not describe the system as vulnerability-free or fully delivered on iOS from a JavaScript export.

Use [TESTING-GUIDE.md](../TESTING-GUIDE.md) and [five-role permissions](permissions.md) for the staff acceptance round. This audit replaces old current-status claims; older dated reports are preserved as historical records.
