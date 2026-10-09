# User manual and workflow verification — 9 October 2026

The old short Help centre instructions have been replaced at `/help` by a searchable, role-filtered User manual. Existing topic anchors remain available. Native expandable sections keep the page compact; topic links expand their destination, including bookmarked topics. The sidebar uses the same route and position with the label User manual.

The manual covers setup/assignments, projects/documents, inventory, requests, shortages, supplier purchasing, receiving, site purchases, assets, attendance/reports, billing/costs, audited corrections, mobile compatibility and troubleshooting. It distinguishes the Admin owner gate above ₱50,000 from Engineer request review and the required Admin/Finance site-purchase review. Request and quotation links remain optional for supplier purchases. Inspection, receipt, payment and actual consumption are separate actions.

Three actual empty form crops illustrate material fields, purchase item rows and the city selection clear control. Numbered boxes and written captions are rendered over the screenshots. WebP files contain no staff credentials, client names, balances, financial records or receipt photos. Full source screenshots are not included in the repository. Images use the existing Next image pipeline with explicit dimensions and responsive sizing; no dependency was added.

## Verification boundaries

- Live Supabase sign-ins succeeded for the supplied Admin, Finance, Engineer, Foreman and Warehouse accounts. Role lookup and inventory reads succeeded for each. All-location RPC quantities matched each account's RLS-visible balances, confirming the aggregate behavior required by migration `20261009170000` is active.
- The local production server, using the live database and supplied accounts, returned the expected mobile role gate: Engineer/Foreman allowed, Admin/Finance/Warehouse denied. Both mobile site roles could load assigned project detail, inventory, requests, reports, attendance, equipment and notifications. Engineer purchase choices/history loaded. An unavailable cross-site inventory query was denied.
- Live verification did not create purchases, dispatches, receipts, consumption, payments or uploads. These posting paths were exercised in an isolated PostgreSQL test database instead.
- The isolated database suite passed 40 workflow checks across all five roles: independent approval, reservations, simultaneous release, receipt/use retry safety, inspection, partial delivery, receipt/consumption corrections, owner approval, supplier payment, billing, sourcing, pagination and final stock/batch/value reconciliation.
- The populated database upgrade test reproduced the former pending-trigger failure safely, then verified the repaired upgrade preserves legacy vehicle and employee data.
- Web: 93 automated checks, TypeScript, ESLint, production build and 111 unique migration versions. Mobile: 18 automated checks, TypeScript and ESLint. Local HTTP smoke checks verified mobile authentication, compatibility and upload/profile authentication boundaries.
- Browser: all five accounts opened the new manual with the expected topics and no Admin-only setup/correction sections for staff. Search submission and clearing, topic auto-expansion, a direct bookmarked section and the 390px responsive layout were checked. The tested page had no horizontal overflow or browser console warnings/errors. The annotated purchase screenshot was visually inspected.

These checks are evidence for the tested paths, not a guarantee that every device, upload, browser, production integration or client scenario has been accepted. Physical Android/iOS camera/gallery, installation/update prompting and the client's final acceptance scenario still require device testing. Recovery email delivery also depends on configured email service. No production schema or business data was modified during this verification.

The obsolete inline Help centre content was removed rather than retained alongside the manual. Existing transactional histories, audit records, supported role restrictions and old route redirects are retained deliberately.
