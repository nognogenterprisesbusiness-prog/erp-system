# Payroll, input and employee dialog refinements — 2026-11-12

## Changes

- Reproduced Employees → Edit showing the employee details drawer over its own open edit form. Open the drawer in a layout effect, before the form's auto-open effect. This shared fix covers other auto-opened forms inside detail panels.
- Keep employee edit dialog identity stable during save revalidation. Close the successful creation form before navigating to the new employee, avoiding retained dialogs on the list underneath.
- Use a black text cursor with a white outline on editable text controls, keeping the insertion caret tied to the field text color. Baseline browser computed styles used the ordinary text cursor; OS-level pointer hiding was not reproduced or changed.
- Replace cramped inline payroll row forms with separate saved amount columns and one Edit action. The existing amount fields, note and command appear in a compact modal. Amount grouping remains intact. Finalization, payment and void controls share cancellation/pending/success behavior.
- Keep departments and Add/Rename. No department removal or SQL migration is included, following the user's correction. Historical department names remain resolvable while only active departments are offered for new payroll.

## Verification

TypeScript, lint, production build and 173 unit tests passed. Isolated PostgreSQL payroll regression covered posted attendance, manual earnings/deductions, Admin-only finalization, retries, overlap rejection, payment, voiding, audit/read boundaries and no duplicate project costs. Desktop browser review reproduced the original overlap and verified the editor is now topmost and focusable, payroll amounts and edit/confirmation dialogs, Cancel discarding unsaved pay changes, and a 390px payroll form. No hosted payroll was finalized, paid, voided or edited. No hosted department or employee was changed during browser QA.

This focused pass does not certify every workflow in the ERP. Actual operating-system mouse-pointer hiding requires testing on the affected staff computer if it persists after this update.
