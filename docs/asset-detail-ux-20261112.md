# Equipment and vehicle detail usability — 2026-11-12

## Changes

- Replaced scroll-only section links with keyboard-accessible Expenses, Details, Project use and History tabs. Only the selected section is visible; inactive forms remain mounted so checking another section does not discard a draft or retry key.
- Added a compact unit header with photo preview, location, plate and Edit details. Existing record drawers and canonical direct links both remain available.
- Replaced linked driver names with plain names and explicit View driver dialogs. Existing driver assignment management and invitation rules remain unchanged.
- Operating expense rows group the amount and compact Correct entry / View receipt actions. The correction dialog identifies the selected entry, explains reversal, requires the existing reason and explicitly labels the final action Remove expense from totals. It does not silently edit or delete posted evidence.
- Moved QR identification into a View QR label dialog, including the existing Print label action. The shared material/warehouse QR component uses the same presentation.
- Project-linked fuel receipts remain separate from operating expenses, under Project use, with explicit View controls. Financial visibility and posting rules remain unchanged.
- Removed redundant small-history pagination footers. Fixed the shared button alignment that could stretch dialog triggers across a grid row; explicit full-width form actions remain full width.
- Browser QA found a stale-page failure: asking for a counted range beyond the last record raised a PostgREST range error. Unit history, operating expenses, project use and fuel receipts now recover that specific error or an empty counted offset to the first page, using one normal request and one recovery request only when necessary. Authorization and other database failures still surface as errors. The fuel receipt loader now requests the exact count used by its pagination; previously its count was always absent.

## Verification

- TypeScript, ESLint, production build and 171 unit tests passed, including section accessibility and range recovery/error propagation tests.
- Isolated asset-expense database suite passed: assignments, concurrency, idempotency, reassignment, driver isolation, receipt access, independent equipment/vehicle histories, unchanged project totals and audited reversals.
- Isolated vehicle-fuel suite passed: approval thresholds, duplicate posting prevention, private photos, reversals and historical access.
- Local authenticated browser checks: Admin vehicle drawer and equipment direct view; section keyboard navigation; selected expense correction dialog; driver detail and assignment navigation; QR dialog on a vehicle and material; expense draft retention after dismissal and switching sections.
- Finance can read amounts without mutation or assignment controls. Warehouse Staff see Details and History only, even with a direct expenses section URL.
- Browser verification reproduced and repaired stale expense/history offsets and checked independent project-use/fuel sections.
- Desktop and 390px phone layout inspected. Narrow tabs fit on one row; correction dialog fits the screen. Screenshots are in `D:/Client-Project/output/asset-redesign-20261112/`.

## Scope and limits

No migration, API command, accounting rule, assignment rule or mobile bundle changed. No hosted business entries were created, corrected, deleted or reassigned during this visual pass. Database mutation behavior was checked in isolated tests. This focused pass does not certify every page or every physical device in the ERP.
