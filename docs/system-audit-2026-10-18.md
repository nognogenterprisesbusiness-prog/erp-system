# Web and mobile logic review — 18 October 2026

## Follow-through: the two web findings are fixed

Material planning now uses the shared paginated catalog picker and explicitly loads the selected material when editing a later catalog entry. Web shortage submission sends no warehouse; Admin chooses an active warehouse for that shortage only. New migration `20261018100000_shortage_request_only_warehouse.sql` permits the report-specific conversion and records the site request's audited source without adding permanent project links. Failed shortage submissions retain the draft and retry key; actual needed-by dates remain separate from source selection. The new isolated regression verifies catalog paging/search and a later material plan, no-link shortage submission/assignment, purchase with partial receipt, concurrent conversion, Engineer approval, dispatch retry and partial site receipt. Request-only warehouse and all 42 five-role workflow checks pass, along with 115 tests, types, lint, build and 133 migration versions. Browser automation failed to initialize, so a fresh visual walkthrough was not completed. No hosted migration was applied. The findings below describe the pre-fix state; release/device/advisory boundaries remain open.

Reviewed web `d2f3801` and mobile `39c1db0`. This review does not change business rules, UI, hosted records or schema. The requested local Android release increments the Android version code to 25 and rebuilds the existing production configuration.

## Assessment

The exercised stock/accounting flows pass. This is evidence for controlled acceptance testing, not a guarantee that every feature, hosted record or installed phone is bug-free. Two remaining web workflow limitations were confirmed by tracing the current page, loader, form and action together.

## Confirmed findings

### P2 — Material planning cannot select catalog entries beyond the first 20

`src/lib/data/material-requests.ts:20` loads only the first 20 active consumables. `getMaterialRequestChoices()` at line 35 reuses that result. `src/app/(workspace)/projects/[id]/materials/page.tsx:44` passes those choices to `ProjectMaterialPlanForm`, whose Material control at `src/components/projects/project-material-plan-form.tsx:29` is a static `SelectPicker` with no search/pagination fetch.

Trigger: a permitted project with more than 20 active catalog materials. Entries after the first 20 names cannot be chosen for a new material plan. An existing plan for a later material retains its hidden initial ID when editing, but its selection label/choices cannot be resolved by this list.

This is not a limit in ordinary New material request: that screen uses `PagedReferencePicker` and a separate lookup for valid preselected material IDs. The shortage-resolution catalog picker is also paginated; the initial 20 choices do not cap its search results.

### P2 — Web shortage reporting still requires a permanently linked warehouse

`getMaterialRequestChoices()` loads `get_requestable_warehouses`, which supplies project-linked warehouses. `src/components/requests/missing-material-form.tsx:35` asks the site requester to choose one, and line 43 disables submission when none is available. `src/app/(workspace)/requests/missing/actions.ts:24` uses the older required-warehouse sourcing schema and command.

Trigger: Engineer/Foreman assigned to a valid project site with no permanent warehouse link. They can create an ordinary source-later material request, but cannot send this web shortage report. This remains inconsistent with the approved source-later request experience and with the existing mobile shortage command, which accepts omitted warehouse/date and uses `submit_mobile_material_shortage`.

Admin's shortage-review assignment control also obtains its choices from the linked-warehouse loader. This review does not recommend removing separate asset or direct-transfer permission rules; the issue is this sourcing UI's dependency on permanent links.

### Dependency review remains open

Fresh `npm audit --omit=dev` results: web has 0 advisories; the mobile production dependency tree has 29 (18 high, 11 moderate, 0 critical). Compatible SDK 57 patches are already applied and Expo Doctor passes 21/21. Dependency-tree counts do not establish runtime exploitability in the APK. No unsupported SDK downgrade, forced dependency override or application rewrite was applied during this audit.

## Verification

- Web: all 115 unit/domain tests, lint, TypeScript, production build and 132 unique migration-version checks pass.
- Mobile: all 22 tests, lint, TypeScript and Expo Doctor 21/21 pass.
- Fresh disposable PostgreSQL databases: all 42 five-role ERP workflow checks pass, including unauthorized access, concurrent stock release/use, owner approval boundary, supplier inspection, partial receipts, corrections, price snapshots, payment/revenue separation, large-list paging and stock/value reconciliation.
- Request-only warehouse selection and mobile integration pass, including no permanent link creation, simultaneous/replayed dispatch, role denial, report-resource audit/cost preservation and partial site receipt.
- Ten stock-simplification checks pass, including cleanup refusal for unvalued legacy stock/transit, preservation of valued stock/costs, available-stock filtering before pagination, generated Philippine dates/references, midnight retry and quantity-only mixed-supplier provenance.
- Vehicle fuel/history and 12 project-cost checks pass, including scope/price redaction, historical rates, concurrent postings, evidence requirements, corrections and project financial reconciliation.
- Itemized mobile site purchase, warehouse staff stock entry/direct delivery, daily attendance and automatic project-site creation tests pass. Receipt approval adds stock once; payments/reimbursements do not add it again. Consumption charges the project once.

The approved state transitions remain: request does not deduct; approval reserves available stock; dispatch deducts warehouse on-hand; accepted receipt adds site stock; recorded use deducts site stock and posts project consumption cost. Paying a supplier alone does not establish a physical receipt.

## Release and operational limits

- A new Android binary was appropriate because the SDK patch/dependency commit postdates build 24. Build 25 completed successfully using the existing local production build script, EAS production environment, fingerprint generation and upload signing key. Both artifact signatures match the existing production certificate; package/version, non-debug release, four architectures and identical verified production bundles were checked. Files and `release-metadata.json` are in `D:/Client-Project/output/nognog-mobile/build-25/`. Fingerprint: `a7843c570faac44b7316218bdf533e704c3bbbbc`.
- Local mobile HTTP smoke tests passed for compatibility metadata, protocol handling, bearer-only authentication and protected photo/receipt endpoints. These tests did not post production business records.
- No Android device was attached when checked with ADB. Cold start, camera/gallery uploads, QR, update-link behavior and two-device reconnect testing are not verified on the new binary.
- Hosted migration installation is not certified by disposable database tests. In particular, `20261017110000_request_only_source_warehouse.sql` must be installed for the request-only assignment workflow.
- Live Supabase Storage/Realtime delivery, account recovery, operational balances, backup restore and client acceptance still require deployment/device verification.
- No Play Store submission, minimum-build enforcement change, hosted migration or production business posting is part of this audit.

The two original web limitations are addressed by the follow-through above. Apply the new migration for the hosted shortage flow; device/deployment/operational verification still remains before turnover sign-off.
