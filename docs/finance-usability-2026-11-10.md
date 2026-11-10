# Project Finance usability

## Approved workflow and scope

This update covers project Overview, Finance, Costs & budget, equipment-hours entry, additional expense entry and audited corrections. It preserves the existing Admin approval authority and Finance read access. It does not create a new approval queue or change project posting, valuation, receipt approval thresholds, billing or profit rules.

Admin opens the project's Finance tab and chooses **Adjust approved budget** beside the budget summary. Increase/Reduce replaces signed-number entry. The form previews the new budget and remaining amount, requires the approval reason and saves through the existing idempotent adjustment command. A successful save returns to the same Finance tab. Costs & budget offers the same action. Budget change history is visible with its full record count.

The detailed chart separates permit fees, subcontract work, utilities, project vehicle fuel and site receipt expenses. Labour and equipment receipts stay in their existing cost lines and are never added again as extras. Site stock and delivery losses are explicitly named. No missing receipt details are fabricated; existing descriptions and original receipt links remain the evidence.

View entries opens a focused, filtered and paginated history immediately, without depending on scroll-to-anchor behavior. Budget history has its own focused view. Finance omits the large project-photo/metric area so the budget appears immediately; those details remain on the other project tabs. Unused history/asset queries are skipped in focused views.

View entries shows the corresponding history. Each entry shows description, reference, category, date and amount. Reversed entries remain visible with their reason and are excluded from chart totals. Corrections explain their audited reversal before submission. Equipment history shows hours and the original rate snapshot. Current-rate choices exclude future and expired rates.

Cost forms open individually in dialogs with pending/save/cancel handling instead of several expanded forms. Missing equipment assignments show an explanation. Narrow-screen histories use stacked rows; the donut uses a compact centre label and a separate exact total. Zero-cost categories do not crowd the chart. Billing and contract-based profit remain in a separate expandable section.

## Database migration and rollout

`supabase/migrations/20261110150000_project_expense_breakdown.sql` adds two read-only reporting functions and one private classification helper. Amounts are aggregated in PostgreSQL; histories are scoped, ordered and filtered before pagination. Admin/Finance execution only; anonymous and operational roles are denied. It changes no posted entry, budget, stock, cost or approval command.

The user applied the reviewed copy `D:/Client-Project/output/nognog-project-expense-breakdown-20261110.sql` to staging. Both reporting functions were verified with real Admin/Finance sessions. Operational roles were denied. Apply the same migration to any separate deployment database before deploying this web code.

These changes are web-only. Android build 31 and its signing/version remain unchanged. The user's local-only release preference remains in effect; no push or deployment is included.

## Verification

- 141 web/domain/UI tests pass, including centavo preservation and prevention of double-counting receipt Labour/Equipment in the detailed chart.
- New isolated PostgreSQL regression passes: real linked site and vehicle fuel receipts, category classification, exact reconciliation with existing profitability, filtered pagination, reversal audit, role/anonymous denial and project isolation.
- 12 existing real database project-cost checks pass, including snapshots, idempotent concurrent posting and budget permissions/adjustments.
- Existing receipt cost-type/payroll regressions pass; 148 unique migration versions verified.
- TypeScript, lint and production build pass.
- Connected browser checks passed against staging: zero budget/costs, under-budget and over-budget summaries, one-category and multi-category donuts, direct expense/budget history navigation, receipt links and Admin/Finance control differences.
- Phone-width checks at 390 × 844 verified stacked expense rows without horizontal overflow, budget preview and Finance read-only controls. These are responsive web checks, not physical-phone acceptance.
- A rejected PHP 0 expense retained its description, reference and amount. A rejected 25-hour equipment entry retained its note and two prepared photos; retry remained available. Evidence preparation disables save/close until complete, and the next successful equipment posting gets a new command key and clears the evidence selection.
- No positive expense, equipment usage, budget adjustment or reversal was posted during connected QA. The reviewed NHA project remained at PHP 10,000 approved budget, PHP 50,000 actual costs and one original additional expense.
- Screenshots and live-access evidence: `D:/Client-Project/output/finance-qa-20261110/README.md`. This verifies the listed Finance scenarios; it does not certify every ERP page or possible workflow.
