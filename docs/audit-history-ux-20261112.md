# Audit history UX refinement — 12 November 2026

## Outcome

Audit history now identifies the record, the account that changed it, and the recorded previous/new values in plain English. Added/Updated/Deleted labels replace database operation names. Actual saved event types describe history entries; a generic database insertion is never presented as approval, release or posting.

Record identities come from saved names/numbers, including saved report snapshots. Known linked references resolve to current authorized record names. The screen states that linked names are current, retains saved identifiers separately, and distinguishes different references when their current names match. Deleted or inaccessible linked records keep their saved reference instead of inventing a name.

Status changes lead the detail view and list summary. Dates use Philippines time, money keeps grouping and up to six decimal places for stored unit costs, and boolean/empty values are readable. Cleared business values remain visible. Unset fields in new records, timestamps, hashes, retry payloads and report snapshots remain in System details rather than dominating the business view. Insertions show saved values; deletions show previous values; updates show both. Change details stack on a phone without horizontal scrolling.

## Removed redundant navigation

- Audit detail panels use their existing Close control; the duplicate All audit logs link is suppressed there. Direct visits retain Back to audit history.
- Payroll details, supplier prices, quotation lists and employee categories apply the same established panel-return policy.
- The repeated View budget change history shortcut is removed; the existing Budget history section remains.
- The raw database-table-name search is removed from Audit history. Its existing record-type selector now uses readable names and covers the mapped record types. Old q-only links no longer apply an invisible technical search.

Canonical pages and functional commands remain available. No audit records, domain commands, calculations, access rules, schema, API or mobile features were changed.

## Performance and access

The list remains server-paginated at 25 entries, with one batched actor lookup. Snapshot fields are loaded only for that page to identify actual changes. Detail lookups resolve only changed references and batch IDs by record type, through the normal authenticated client/RLS. They do not use a service-role bypass or query each list row individually.

## Verification

- 164 unit/component/domain tests passed, including readable values, zero/false/null, exact saved identities, same-name references, absent data, snapshot grouping and accurate event wording.
- Type checking, lint, production build and workflow inventory passed.
- Browser: Admin list and detail; report history event; Draft → Submitted values; request project/site/requester names; direct-page return; panel shortcut suppression; filter selection and filter preservation after Close; 390px detail layout without horizontal overflow.
- Finance is denied both /audit-logs and /audit-logs/745. No stock, expense, attendance or other business records were posted during browser checks.
- Screenshots are in D:/Client-Project/output/audit-ux-20261112/.

This focused review does not establish that every screen and possible business state is bug-free. No database migration or AAB is required.
