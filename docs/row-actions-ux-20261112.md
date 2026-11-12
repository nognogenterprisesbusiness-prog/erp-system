# Compact actions, readable filters and driver assignment — 2026-11-12

## UX changes

- A record with only View keeps one text button. Additional actions use an icon-only three-dot menu; View remains outside it. Existing tooltips, contextual accessible names, focus handling, keyboard navigation and confirmation forms remain.
- Users: removed stacked account action buttons. View opens the same profile, while the menu opens the existing role, access or password-reset confirmation. Self/higher-privilege restrictions remain enforced.
- Documents: View stays visible; Download, Edit details and Delete document share one menu. Native protected file routes and preview targets are preserved. Non-Admin viewers do not receive edit/delete controls.
- Equipment requests and Purchasing use the same compact secondary-action presentation. Existing status-derived availability and business commands are unchanged. Supplier-payment dialogs retain the draft and retry payload on dismissal, including when opened programmatically.
- Fixed the shared sticky Actions column layout so View and the three-dot menu stay in one row rather than stacking.
- Filter selects now have more width, show wrapped selected text and provide wider collision-aware option lists. Long project names remain readable rather than truncated with ellipses.
- Departments now has an explicit Add department dialog, a clear empty state and Rename dialogs. Department and payroll rules remain unchanged.
- Truck driver rows show a private account photo or initials beside the name. Add driver opens a searchable, bounded account selector using the existing assignment command. A truck can keep multiple drivers for shifts; each driver still has one truck. Moving someone from another truck is explained before saving. Already-assigned, inactive and unfinished accounts are excluded from the add list. Removing/changing an existing assignment remains available through View → Change assignment.

## Verification

173 unit tests, TypeScript, ESLint and the production build passed. Shared menu tests cover View-only rows, icon-only multiple-action menus and native file preview targets. The isolated asset-expense database suite passed, including shared trucks, assignment concurrency, reassignment rejection, own-history access and audited reversals.

Browser review covers the Users menu/confirmation, readable employee project filters, department dialog, document menu/edit form, truck profile/assignment search, equipment-request actions and Purchasing supplier-payment dialog. Finance browser checks confirm department and driver assignment controls remain unavailable; its existing document-access denial remains unchanged. Desktop and phone screenshots are saved under `D:/Client-Project/output/row-actions-20261112/`.

No SQL migration, role policy, posting command, accounting rule, or mobile bundle changed. No live account was deactivated or reset, document deleted, payment posted, or driver reassigned during visual checks. The staging dataset has one driver already assigned to the sample truck; multiple-driver write behavior is verified by the isolated database suite, not by adding live accounts. This is a focused UX pass, not a claim that every ERP scenario is bug-free.
