# Approved simple mobile client — 2026-09-28

**Current audit — 2026-10-10:** [System audit and remaining native release gates](package-3-turnover-audit-2026-10-10.md). SDK 57 compatible patches, 18 mobile tests, types/lint, Expo Doctor 21/21 and Android/iOS bundle exports pass. The current backend passes 42 isolated PostgreSQL workflow checks and 12 project-cost/capacity checks. Installed-device workflows, signed replacement builds, notification/email delivery and operational acceptance remain separate gates. Earlier dated verification notes below are historical.


**Historical code verification — 2026-10-07:** repaired the Engineer receipt upload POST route and added [conditional compatibility checks](mobile-compatibility.md), keeping legacy protocol 1 supported. Web checks, 78 web unit tests and the local HTTP smoke suite pass; mobile checks, 17 tests and iOS/Android bundle exports pass. No new APK, store submission or OTA update has been released. Installing the checking feature, authenticated receipt upload and physical-device acceptance remain separate steps.

The approved native client lives beside this repository in `../nognog-mobile`. It serves active, onboarded Foremen and Engineers. Admin and Admin-plus-Engineer accounts use the web ERP. This scope supersedes earlier web-only/future-mobile notes; it does not expand the mobile release into administration, finances, demo mode or offline writes.

## User flow

Login → Home → select an accessible project/site → record site activity. Four tabs: Home, Projects, Requests, Profile. Four Home actions: Request Materials, Request Equipment / Vehicle, Site Inventory, Daily Report. Home is the only project/site selection entry point; work screens do not repeat a project selector. Receive Deliveries is a separate Home tool, and site stock movements are labelled History. Attendance, material consumption, assigned equipment/hours and history are reached inside a project.

Material requests inherit the Home-selected project/site and retain remarks and line quantities. The server sets the request date; authorized web staff assign the source warehouse before approval. Engineers review another requester's submission; warehouse release remains web-based. Foremen/Engineers confirm partial/full receipts. Foremen post multi-worker attendance and authorized equipment hours. Engineers view operational attendance, independently review daily reports and record progress from an approved report.

Reports retain the server-side draft/submission/review/correction lifecycle. Opening today's report reads posted material use, attendance and equipment hours without creating a record. On Submit, the app creates an internal draft, links selected activity, uploads an optional photo through the ERP's verified private WebP pipeline, and submits for Engineer review. The mobile screen has no separate Save Draft action; a failed upload leaves an editable record for retry. Report submission does not post activity costs again.

## Server interface

All routes are under `/api/mobile/v1` and require `Authorization: Bearer <Supabase access token>`. Cookie authentication is not accepted; the mobile path bypasses the web cookie-refresh proxy. Native clients do not require browser CORS access.

| Interface | Purpose |
| --- | --- |
| GET `session` | Fresh account/role check, operational profile, unread count |
| GET `projects`, `project?id=…` | Assigned project list/detail and accessible sites/personnel/warehouses |
| GET `materials`, `requests`, `request?id=…` | Request input choices, status, approval lines, deliveries and event history |
| GET `inventory`, `inventory-history` | Site balances and operational movement history |
| GET `equipment-options`, `equipment-requests`, `equipment`, `equipment-history` | Requestable assets, request status, custody and hours |
| GET `workers`, `attendance` | Assigned workers and wage-free attendance |
| GET `reports`, `report`, `report-resources` | Reports and already posted activity |
| GET `notifications`, `qr?identifier=…` | Recipient inbox and authorized QR resolution |
| POST `commands` | Discriminated shared domain command `{ action, input }` |
| GET `photos/{kind}/{id}` | RLS/Storage-protected image bytes |
| POST `photos/daily-reports/{id}` | Multipart `photo` for the caller's editable draft |

JSON responses use `{ ok: true, data }` or `{ ok: false, message, fieldErrors? }`. Lists use `page` (20 records/page) and bounded `search`; site operations accept `projectId`, `siteId` and, where applicable, `date`. Record reads use `id`; resources use `linked=true|false`. Types and runtime response schemas are exported from `@nognog/domain`.

Each request verifies the token against Supabase Auth and rereads account status/roles. Database calls use the caller's public-key client with their bearer token, never service-role access. Existing RLS and authoritative RPC commands retain stock locking, receipt repair, rate selection, cost snapshots and independent review. Responses select/strip operational fields and never return budgets, wages, rate snapshots or cost totals. JSON bodies are bounded to 256 KiB; photo bodies to 3.1 MB, with a 3 MB input-image limit. Database errors are translated into user messages. Per-account read/write rate limits are stored in a private table.

Web request, consumption, equipment, report/progress and resource actions reuse server command services and keep their existing redirects/revalidation. Private photo reads/writes also share helpers.

## Database rollout

`20260928100000_mobile_site_commands.sql` adds the private mobile limiter, operational read RPCs, a notification-unread command, site QR resolution, equipment retry columns/wrapper and atomic attendance batch RPC. Project discovery accepts active project assignments or a matching active site assignment. Reads and mobile command authorization check the specific site and required role. Attendance/equipment insert guards enforce the Foreman's site role. The batch resolves costing basis inside PostgreSQL and delegates to existing single-worker posting; one invalid worker rolls back the entire batch. Equipment retry keys bind actor plus original payload. A report-resource trigger locks the report, checks ownership/role and restricts activity editing to drafts, preventing submission/edit races.

Run ordered migrations and tests in a disposable local/staging database **before** any production rollout. The mobile integration script installs the new migration only into the fixture's generated local clone when absent; it preserves the source database. It also reapplies the existing receipt repair inside that clone. It covers the request → independent approval → warehouse release → partial/full receipt → consumption → report-link database sequence, retries, duplicate/invalid attendance, atomic rollback, financial read denial, report ownership/review, equipment retry conflicts and revoked project access. The SQL runner exercises the same underlying caller RPCs as the mobile/web services; authenticated HTTP/device UAT remains a separate gate.

The other chat's `20260928110000_site-scoped-foreman-access.sql` and `20260928120000_site-scoped-material-request-submission.sql` were preserved. The mobile queries now understand site-only assignments, expose per-site recording/review capabilities and reject commands for another site. Review the final combined migration set in isolation: existing web posting RPCs and RLS still depend on those permission changes for site-only accounts.

## Verification record

| Check | Result |
| --- | --- |
| Mobile TypeScript/lint | Passed |
| Mobile workflow/session storage tests | 7 passed, including rotation/logout serialization |
| Android and iOS production JS exports | Passed; no device installation claimed |
| Expo dependency/config checks | 21/21 passed |
| Web TypeScript/lint/production build | Passed |
| Web/domain suite, including mobile validation/security | 62 passed |
| Migration version uniqueness | Passed (66 versions in shared checkout at verification) |
| Local HTTP authentication smoke | Passed: missing/malformed bearer and cookie-only auth rejected; unauthenticated writes rejected; no-store responses |
| Browser smoke | Login renders at 375×812, with readable buttons and no new rendering errors; password visibility and protected-route redirect checked. A Zod 3/4 Metro mismatch was corrected. No authenticated posting claimed. |
| Disposable database integration | Blocked before fixture creation: Docker Desktop Linux engine is unavailable |

Docker's backend startup log reports an inaccessible `sailor-ingest.sock`. Automatic approval review rejected deleting that stale socket with “blocked by policy”; no Docker data or database was modified. Restore Docker Desktop, then run:

```bash
npm run test:mobile-integration
npm run test:material-reservations
npm run test:inventory-concurrency
npm run test:automatic-attendance
```

For local HTTP checks, start the built web app with `npm run start -- --port 3103`, then run `npm run test:mobile-http`. The runner refuses remote ERP hosts. The ignored mobile `.env.local` contains only the existing ERP's public Supabase URL/publishable key and a LAN development ERP origin. Verify the LAN address before using a phone; follow the mobile README. No production migration, deployment or app-store submission was performed.

## Remaining release gates

- Exercise actual login failure, restored/expired sessions, logout/account change, inactive accounts, assignment revocation and cross-project denial with isolated Supabase accounts.
- Execute database suites and confirm quantities, once-only costs, web-visible activity and combined migration compatibility.
- Check Android/iOS camera/photo denial, manual/invalid QR input, upload/save failure and retries, empty lists, keyboard visibility, small screens, large text and native form controls.
- Verify the phone can reach the configured ERP origin and its ordered migrations are installed in an isolated environment. Do not point integration test scripts at production.
- Review dependency audit before release: the SDK 57 dependency tree currently reports 14 moderate findings, rooted in URI decoding and a build-tool UUID dependency. npm's suggested SDK downgrades conflict with the approved SDK. See [URI decoding advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) and [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq); no forced dependency overrides were introduced.

These checks remain unaccepted. Passing static tests and exports does not establish connected database or native-device acceptance.

## Mobile receipt simplification — 2026-10-13

Mobile Buy at hardware store has New purchase and History buttons. New purchase requires the actual hardware store, existing catalog materials, quantities, unit prices and receipt photo. The total is calculated. Home supplies project/site; the server generates the Philippine date and system reference and keeps them on retries. Company cash remains the default with no payment-source, date, receipt-number or notes fields. Submission creates a pending itemized receipt without changing stock or project cost. Admin/Finance approval adds site stock once; above PHP 50,000 only Admin can approve. Actual consumption deducts site stock and charges the project once. Web retains receipt-only expenses and historical reimbursement workflows. Add diesel receipt remains inside vehicle history with the vehicle preselected; it records expense only and never material stock. Requires migration 20261013190000_mobile_itemized_site_purchases.sql and the corresponding web API deployment before using the new mobile form.

No migration is added. The site-scoped equipment endpoint now honours an optional asset ID so the diesel action validates current assignment without a large asset list. Vehicle-history SQL from the earlier release is confirmed present on the configured database. Git global and repository emails are nognog.enterprises.business@gmail.com. Web/mobile changes are committed directly on main and authorized for push.

Verification: mobile typecheck/lint, 25 tests, native exports and Expo Doctor 21/21; web typecheck/lint, 113 unit tests, production build, isolated receipt-expense/stock-entry and vehicle-fuel/history tests passed. Physical-phone acceptance and store distribution remain separate from a successful build/push.

### Current mobile purchase contracts — 2026-10-14
The current app uses mobileActionCommandSchema for general commands and mobileReceiptCommandSchema for itemized material purchases and diesel uploads. Receipt payloads reject cash-source fields; diesel omits notes too. The server mobileCommandSchema still accepts installed builds and supplies the existing company-cash accounting default for new diesel payloads without a paidWith field. Old cash selection and receipt-only entry paths are removed from the current client rather than hidden. Historical receipts, reimbursement data and web accounting fields remain intact. Deploy this API before distributing mobile build 23. No new database migration is needed for this contract/UI cleanup. Shared domain packaging excludes tests, which remain tested in this repository.
