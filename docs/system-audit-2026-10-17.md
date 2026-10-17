# Web, mobile and database audit — 17 October 2026

## Follow-through — 18 October 2026

The web request-creation inconsistency is fixed in source. Both clients now submit catalog items without a source warehouse or required date through the existing validated request command. Admin/assigned Warehouse Staff chooses the source for that request before approval. Web creation no longer reads permanent warehouse links or restricts the picker to stock at a selected warehouse. Valid catalog deep links beyond the first page are preserved. Legacy explicit-source API commands remain for installed clients and planning/sourcing workflows.

All remaining authored native select controls were replaced with the shared custom picker (workforce, report context, warehouse personnel/project assignment, user role, supplier-price filters and quotation comparison). Search results remain paginated, stale search responses are discarded, pending request controls are disabled, and rejected saves preserve the request draft and retry key. The manual now describes the same web/mobile source-later flow.

The regression fixture supports the existing local-only portable PostgreSQL runner when ERP_TEST_PG_BIN is configured, while retaining Docker support. The mobile integration suite uses the Philippine current date and tests permitted audited report-link edits after approval, including unauthorized denial, audit growth and unchanged posted cost. Its obsolete migration reapplication was removed. Mobile integration, automatic attendance, request-only warehouse and all 42 five-role workflow checks passed; 115 web tests, web lint/types/build and 132 migration-version checks passed. Mobile types/lint, 22 tests, 21/21 Expo Doctor checks and Android/iOS bundle exports passed after the SDK 57 patch alignment.

A signed-in Engineer browser check confirmed no warehouse/date fields in New material request, selectable catalog materials and zero-quantity server rejection with the purpose/quantity retained. No business request or inventory movement was posted in the hosted database. The screenshot of empty generic controls is in `public/manual/request-items.webp`.

The four Expo version mismatches are resolved. Compatible npm updates were applied, but npm still reports 29 dependency-tree advisories (18 high, 11 moderate). The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) list no patched versions. The [URI decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) has a patch at 0.5.0 outside the decoder range of the SDK 57 router's query-string dependency. No unsupported downgrade, cross-SDK router replacement or unverified dependency override was applied. These upstream items remain open; device installation, hosted migration state, uploads/QR and operational UAT remain unverified. Bundle export is not a replacement signed installed build.

No new SQL migration is required by this follow-through. The previously delivered `20261017110000_request_only_source_warehouse.sql` is still required if not yet applied. The original audit below records the findings as they existed before these fixes.

---

Reviewed web commit `42338ce` and mobile commit `e8febe7` (Android build 24 configuration). This was a review: application behavior, UI and hosted data were not changed.

## Assessment

The tested inventory/accounting paths reconcile and enforce the five-role boundaries. The system is suitable for continued controlled acceptance testing, but there are outstanding consistency and release-verification items. This audit does not establish that every feature, production record or installed phone is defect-free.

## Open findings

### 1. Web material-request creation still requires permanent warehouse links

Priority: high, workflow inconsistency.

`src/components/requests/material-request-form.tsx:46` still presents a source warehouse restricted to permanent project links. Lines 71–72 require a linked source and disable submission without it. `src/lib/data/material-requests.ts` loads `get_requestable_warehouses`; `src/app/(workspace)/references/actions.ts` searches stock using a required warehouse; the shared `submitMaterialRequestSchema` requires `warehouseId`.

By contrast, mobile submits catalog materials without a source; Admin subsequently selects a warehouse for that request only. The corrected `20261017110000_request_only_source_warehouse.sql` makes this assignment and subsequent dispatch independent of permanent project membership.

Consequence: a site without permanently linked warehouses can request from mobile but cannot complete the equivalent web form. Web creation needs alignment with the source-later flow, including schema/action/picker/manual tests. Changing only the dropdown labels would not resolve it.

### 2. Native dropdowns remain outside stock-entry forms

Priority: medium, UI consistency.

Native `<select>` controls remain in workforce assignment/rate forms, daily reports, account-role selection, warehouse details, supplier-price filters and quotation comparison. The shared custom picker fix does not apply to these native controls. Stock movement and material-use forms use the custom components. This is a remaining styling/interaction difference, not evidence of incorrect stock accounting.

### 3. Mobile dependency alignment and advisory review remain open

Priority: release review.

Expo Doctor passed 20 of 21 checks. It reported these installed/expected versions:

| Package | Installed | Expected |
|---|---|---|
| expo | 57.0.28 | ~57.0.30 |
| expo-constants | 57.0.21 | ~57.0.22 |
| expo-linking | 57.0.12 | ~57.0.13 |
| expo-router | 57.0.26 | ~57.0.28 |

`npm audit --omit=dev` reported zero web production advisories and 29 mobile dependency-tree advisories: 18 high, 11 moderate, zero critical. Expo's dependency tree includes build tools; this count is not proof that the installed app exposes 29 exploitable vulnerabilities. Runtime reachability and compatible remediations were not established in this review. No dependency overrides, downgrades or new build were made.

### 4. Older regression scripts have drifted from the current system

Priority: medium, verification reliability.

`test:automatic-attendance` and `test:mobile-integration` require Docker, which is unavailable on this computer. The attendance assertions passed when run unchanged against the existing portable PostgreSQL fixture via a temporary import adapter.

The older mobile integration script also hardcodes 28 September 2026 for movements on a newly created request, causing a legitimate “dispatch date precedes request” rejection. A second temporary run using today's date reached its expectation that approved report resources cannot be detached; this expectation conflicts with `20260928140000_allow_audited_report_resource_links.sql`, which explicitly permits audited changes by the preparer/Admin after submission. Therefore this legacy suite was not reported as passing. Temporary test files were removed; tracked tests were not rewritten to hide failures.

## Verified workflow evidence

| Area | Evidence and outcome |
|---|---|
| Requests and inventory | Submission does not deduct; approval reserves; dispatch deducts warehouse stock; inspected receipt adds accepted site stock; use deducts site stock and charges the project. Existing 42-role workflow and six assignment/grouping checks passed on the reviewed web source. |
| Request-only source | Selection, approval, concurrent/replayed dispatch and partial receipt succeed without creating a project warehouse link. Changed retries and unauthorized roles are rejected. |
| Stock valuation/corrections | Cost layers, posted snapshots, returns, receipt/use corrections and balances reconcile in the workflow checks. Ten stock-simplification checks passed, including safe opening-setup retirement and unresolved-stock cleanup refusal. |
| Purchasing | One purchase record groups its items. Optional quotations/request context, the PHP 50,000 owner gate, supplier inspection, partial receipt and payment safeguards passed. Payment does not post stock. |
| Mobile site purchases | Itemized receipt approval adds site stock once; subsequent use charges the project once. Automatic references/date, midnight retries, rejected purchases, simultaneous approvals and the owner gate passed. |
| Warehouse operations | Assigned Warehouse Staff valued stock-in and permitted direct site delivery passed, including concurrency, checker receipt and partial quantities. Direct deliveries retain their separate project-link rule; request-bound deliveries use the saved request source. |
| Vehicles/equipment | Twelve costing/capacity checks passed, including evidence photos, historical rate snapshots, competing postings, scope denial and reversals. Vehicle fuel/history checks passed, including movement/hours/diesel timelines, paging and quantity/price visibility. |
| Labor and expenses | Attendance costing, duplicate/concurrent posting denial, wage redaction, report links and reversal passed in the adapted attendance run. Project-cost tests reconcile labor, material, equipment, expenses and budget changes. |
| Billing | Invoice/collection retry handling, partial collections, reversals, outstanding balances and contract limits passed in the earlier same-source workflow checks. |
| Projects/sites | Default-site creation, inherited Engineer/details, stock location/QR, retry, rollback, role guards and existing-site preservation passed. |
| Roles/security | Admin, Finance, Engineer, Foreman and Warehouse Staff authorized/denied paths are exercised by database tests. The fresh migrated schema has 98 public tables, all with RLS enabled. Every public/private security-definer function has a configured search path. This structural check does not prove every policy is sufficient by itself. |
| Notifications | Phone-push retirement tests passed; inbox/history remain. Background phone delivery is intentionally removed. Live inbox/Realtime delivery still needs operational acceptance. |

## Application and UI verification

- Web: 115 unit/domain tests, lint, TypeScript and production build passed on the reviewed source during the preceding verification; no application source changed in this audit. Migration-version validation passed with 132 versions.
- Mobile: TypeScript, lint and all 22 tests passed. Android and iOS JavaScript/native bundle exports succeeded. An export is not a newly signed binary or an installed-device test.
- Additional strict TypeScript checks with `--noUnusedLocals --noUnusedParameters` passed in both repositories. They do not detect every unused exported symbol or prove every database object is needed.
- Local mobile HTTP checks passed for bearer-only authentication, invalid/newer protocols, uncached compatibility metadata, profile access and receipt/photo upload authentication. These did not post business records.
- Read-only browser checks on Inventory, Purchasing and Vehicles at the current narrow viewport showed no page-wide horizontal overflow. The earlier shared-dropdown check confirmed unchanged body width, internal menu scrolling and Escape dismissal.
- Reviewed mobile project/site context, scope-keyed form state, idempotency keys, error retention, authenticated API calls, server-side site authorization, cache invalidation, reconnect refresh and subscription cleanup. Stock mutations are not applied optimistically.
- Historical migrations, audit/cost layers, command receipts and compatibility routes are not safe deletion candidates merely because they have no independent menu entry. No broad code/table deletion was performed.

## Still required before turnover sign-off

1. Align web request creation with the request-only source workflow and verify both clients against the same rules.
2. Verify the latest migration is installed in the hosted database; this audit only rebuilt disposable local databases and did not apply hosted SQL.
3. Test the exact installed Android build: cold start/update screen, camera/gallery permissions, receipt/equipment uploads, QR scanning, interruption/retry and project/site switching. iOS store/signing/device delivery remains separately unverified.
4. Complete five-role client acceptance with actual operational data, two-client Realtime/reconnect behavior, email recovery/invitation delivery, financial reconciliation and backup/restore rehearsal.
5. Resolve mobile dependency review, the stale integration suite and remaining custom-control consistency work.

No hosted stock, approvals, payments, warehouse memberships or schema were modified by this audit. No new APK/AAB was created.
