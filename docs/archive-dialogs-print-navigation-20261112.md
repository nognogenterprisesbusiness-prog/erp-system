# Archive dialogs and employee print navigation — 2026-11-12

## Confirmed bug

Opened ARGIE CEBALLOS from Employees, then selected Print card. The client router matched `/employees/id-cards?employee=9fd7e421-2857-4f1d-986e-2c42891b834a` to the intercepted employee `[id]` detail route, treated `id-cards` as an employee ID and displayed Record unavailable. The employee itself loaded correctly.

Both worker-card entry points now open an in-place preview dialog without changing the URL. Cards load only when opened, preserving employee/project filters and existing Admin authorization. The existing legacy print URL and preview reuse one protected loader and card layout. Scoped print styles print only the cards; frame protections remain unchanged. Genuine missing or unauthorized records retain their existing unavailable state; this change does not bypass access checks or hide errors.

## Dialog refinements

- Employee and supplier archive controls show one button until selected. Their compact dialogs identify the record, explain the effect, require a labelled reason of 3–500 characters, and provide Cancel and Confirm archive.
- Project workforce End assignment now opens a compact reason/date dialog instead of exposing the form in every row. The existing employee-detail assignment dialog uses the same form. Removed its abandoned inline-form branch.
- Material Archive now requires confirmation through the existing archive command. No new reason requirement was added to that command.
- Employee-category Edit/Archive actions share one three-dot menu. Archive opens a confirmation dialog and returns expected validation/assignment errors inside it instead of throwing the entire page into an error state. The existing SQL guard still blocks archiving a category with unarchived employees.
- Replace ID card uses the shared Cancel/pending controls and prevents dismissal during submission. Small employee confirmation forms use compact dialog widths.
- Existing cancellation, expense correction, asset removal and attendance reversal controls already use dialogs. Optional-information and history disclosures remain disclosures.

## Verification and scope

173 unit tests, TypeScript, lint and production build passed. Authenticated browser review verifies the reported employee, reason/confirmation dialogs, employee-card previews, supplier and material archive controls, category confirmation and project assignment ending on desktop; employee confirmation and preview also checked at 390px. Screenshots are under `D:/Client-Project/output/archive-dialogs-20261112/`.

No database migration, mobile bundle, archive RPC, assignment rule or role policy changed. Physical printing was not performed. The category server wrapper now returns its existing guard failures as form feedback. No hosted employee, supplier, material, category, assignment or ID card was changed during visual QA. This focused pass does not certify every ERP scenario.
