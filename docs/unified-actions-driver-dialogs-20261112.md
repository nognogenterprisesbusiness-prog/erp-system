# Unified actions and in-place driver editing — 2026-11-12

## Final rule

One action is a visible button. Two or more actions are all inside one icon-only three-dot menu, including View. This replaces the previous View-plus-menu policy. The shared component has no force-menu exception.

Users, Documents, equipment requests and Purchasing follow that rule. A read-only row with only View has one View button. View-only file previews keep their native protected URL and new-tab target; menus do not change authorization.

Deactivate uses the installed blocked-user icon; Reactivate uses the checked-user icon; Reset password uses a key. Download, payment, edit and handover use matching icons. Unmapped commands use text rather than a misleading arrow.

## Driver flow

- Removed the duplicate Drivers list, driver edit screen and their shortcuts. Old driver URLs redirect to Users, without another management UI.
- Users → driver’s menu → Edit assignment opens a compact dialog on Users.
- Vehicle → assigned driver’s menu → Edit assignment opens the same dialog on the truck record.
- View opens a profile dialog. Driver names and account avatars remain visible on the truck.
- Truck search updates within the dialog; no Search button or separate page is needed. Active trucks are searched by sanitized name/code with 50-result bounds. Superseded results cannot overwrite a later search. The current selection remains available while searching.
- Choose No truck assigned to remove an assignment; Save is disabled until the selection changes. The existing Admin command, RLS, one-truck-per-driver rule and multiple-drivers-per-truck behavior remain authoritative.
- Shared form dialogs explicitly align content left, including when opened from right-aligned table cells. Small account/assignment dialogs use the compact width.

## Verification

TypeScript, lint, production build and 173 unit tests passed. Shared-menu regression tests cover View-only records and multiple actions rendered as one trigger. The isolated asset-expense suite passed, including shared trucks, concurrency, reassignment, own-history access and audited expense reversals.

Authenticated local browser checks cover Users View/menu policy, in-place assignment editing from Users and truck records, removal selection and hidden ID serialization, truck search, profile dialogs, document actions, equipment approval confirmation, Purchasing payment draft retention and legacy driver URL redirection. Desktop and 390px layouts are inspected. Screenshots: `D:/Client-Project/output/unified-actions-20261112/`.

No migration, mobile build, accounting policy or assignment command changed. No hosted account, payment or assignment was mutated during visual QA; mutation invariants were exercised in the isolated database suite. This focused pass is not an assertion that every ERP scenario is bug-free.
