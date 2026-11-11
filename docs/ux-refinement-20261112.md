# UX refinement verification — 12 November 2026

Scope: refine existing web screens and commands. No schema, RLS, posting RPC, domain calculation, API endpoint, dependency or mobile changes. Existing permissions, record history and transaction retry keys remain authoritative.

## Changes

- Headers wrap their actions before compressing their titles; numeric cells retain explicit alignment. Phone table mode explains horizontal scrolling and the existing Cards option.
- Unscoped purchasing, unit-use, planning, worker and project forms require an explicit record selection. Explicit project/request/quotation context remains prefilled. A unique site remains selectable from its project.
- Stock Counts starts with a location prompt instead of a silently selected first site. Request-linked transfers link to the real request foreign key; an inaccessible link falls back to the requests collection.
- Vehicle/equipment details show existing operational expenses and driver information before registry history. Section links keep drawer navigation intact. Unit operating expenses and project-linked fuel explain their distinct accounting scope.
- Existing account status, password reset and warehouse assignment end actions use confirmation dialogs. Project, daily-report and document dialogs warn before discarding edited ordinary forms. Scoped transaction forms retain their prior retry/draft behavior.
- Field labels remain stable; hints/errors are associated with controls. Date navigation and dialog close targets are larger on phones.
- QR registry displays human record names using bounded, authenticated page lookups. Dashboard labels describe the existing metrics accurately. Invoice details explain issuance snapshots. Missing progress remains explicitly missing rather than implying an approved zero.
- Attendance page search explicitly says it filters the current page; the existing scan/evidence screen is linked from the selected project context. Site-purchase copy distinguishes stock from expenses and empty states explain the selected status.
- Readable dates/statuses, grouped amounts/rates and secondary metadata improved in affected views. Daily-report lists suppress duplicated project/site names without renaming stored data.

## Boundaries from the audit

The audit's proposed global attendance search and new loss-category drilldowns would require additional data-query behavior. They were not added under the no-new-features instruction. Existing search scope is now explicit; existing cost detail/source navigation remains. This pass does not claim that every possible role/device/state is bug-free, or that every metadata occurrence across the application has been redesigned.

## Verification

- 160 automated unit/component/domain tests passed.
- TypeScript, lint, production build and workflow inventory audit passed.
- Isolated PostgreSQL: 42 ERP workflow cases, 12 project-cost cases, multi-warehouse requests, expense breakdown, QR attendance and face-evidence suites passed. These include retries, authorization denials, posting reconciliation and immutable evidence checks.
- Browser: Admin and Finance Inventory; 1265px header fit; 390px phone layout without horizontal document overflow; unscoped Stock Counts prompt; purchase supplier/source placeholders; project discard/keep-editing dialog; named QR registry; vehicle expense order and drawer close after section navigation; real transfer-to-request links.
- Browser verification did not post stock/cost/attendance, send reset emails, deactivate users or end real assignments. Face-camera capture on a physical phone remains a device acceptance check; no native camera behavior was changed here.

Screenshots: [desktop Inventory](../../output/refinement-20261112/inventory-desktop.jpg), [phone Inventory](../../output/refinement-20261112/inventory-phone.jpg), [vehicle details](../../output/refinement-20261112/vehicle-details.jpg).

No migration or new AAB is required for this web refinement.
