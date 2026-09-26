# Connected web UI continuation — 26 September 2026

The retired demo is not reinstated. These changes use the existing authenticated routes, server actions, storage endpoints and role checks. Vehicles remain within the agreed “sasakyan” scope and retain their registry and navigation entry.

## Implemented in source

- Project details use Overview, Sites, Labour, Materials, Finance and Documents sections on a dedicated page. Only the selected section loads its detailed records. Finance visibility remains permission-controlled.
- Projects, warehouses, suppliers, employees, materials, equipment and vehicles use a shared Add dialog with consistent Save/Cancel controls. Existing `/new` master-record links redirect into the corresponding dialog; project details remain a full page.
- Project forms retain actual photo uploads, structured locations and server-side validation, with custom dates/pickers and formatted peso amounts. Calendar Escape closes the calendar before the parent form.
- Dashboard monthly expenses use category line series from the existing posted-cost RPC. Material consumption uses six dated months of authenticated ledger records, paginated beyond the default response limit, with reversed entries excluded. Different units are never combined into a single quantity series. Recent activity is full-width below the charts; the upper two panels use the same gutter as the four metrics while retaining independent heights.
- Shared compact filter bars remove the oversized enclosing search cards on the main registry, inventory, request and daily-report lists. Top-bar search uses the same search field. Attendance filters wrap at narrow widths rather than stretching into empty columns.
- Audit accounts display a circular authenticated profile photo when present, with initials when no image is available or retrieval fails.
- Inventory remains the stock-balance entry point; Material catalog remains available in Inventory tools. Catalog records and physical stock balances are not merged or deleted. The duplicate catalog sidebar entry is removed.
- Private project-card photos use the authenticated record-photo endpoint without Next.js image optimization stripping the user session.

## Verification performed

- Production Next.js build, TypeScript checks and ESLint passed after these changes.
- Four-role auth unit tests passed (3 tests). Earlier in this continuation, the existing unit/media/security/request/inventory-domain/daily-report suites also passed.
- Isolated actual-component render checks covered 24 project role/section combinations and three labour currency/deduplication/privacy cases. Fixtures were diagnostic-only outside the repository and made no database writes.
- Isolated dashboard checks covered 501-record pagination, reversal exclusion, signed quantities, independent units, empty/error handling, accessible chart data and PHP formatting.
- Browser checks of the shared dialog confirmed that the May 2027 calendar was not clipped at a narrow viewport, Escape closed only the calendar, custom picker selection worked, and Cancel closed the form.

## Not verified by these checks

### QR, filters, dashboard totals and form consistency

QR registry now has identifier search, a record-type picker, filtered CSV export and a matching five-column skeleton with export/action placeholders. Export is admin-only, batches 500 records and rejects exports above 20,000 records; spreadsheet formula escaping remains enabled. Shared list filters now use debounced client-side navigation, reset pagination and preserve scroll instead of Apply buttons/full-page submissions. Daily-report dates also apply automatically and clear conflicting date bounds atomically.

The dashboard replaces Active warehouses with admin-only Total sales (issued invoices, not collections), Total expenses (posted project costs, not cash payments), and Total material value (valued on-hand stock, excluding transit). These require the **unapplied** `20260926180000_dashboard_totals.sql` migration after existing migrations. Unknown stock/cost valuation shows unavailable rather than a fabricated zero. The RPC checks admin authorization even though authenticated accounts can invoke it.

Project field labels, photo label weight, input heights and structured location alignment are normalized. Shared dialogs use a fixed heading, internally scrolling body, rounded clipping and a thin scrollbar. Daily stock tools are separate from occasional admin reconciliation/exception commands; required inventory workflows are not deleted.

Verification: production build and ESLint passed; all 23 existing unit/auth/security/media/request/inventory-domain/daily-report tests passed. Isolated QR export tests covered authorization, filtering, 501-row batching, formula escaping and oversized-export refusal. Actual-component browser checks confirmed search/picker navigation preserves terms and resets pagination, no Apply button, modal calendar visibility, Escape behavior and conflicting date bounds. Diagnostic fixtures remained outside the repository and made no database writes. The dashboard totals migration and its database/RLS/results tests have **not** run; these changes are not a deployment approval.

### Dashboard empty-chart follow-up

Following the supplied screenshot, paired dashboard cards now stretch to the same row height instead of leaving exterior gaps beneath the shorter card. Empty material consumption retains the six-month chart grid and an explicit “No recorded usage” label; no sample series, units or quantities are fabricated. Targeted render checks verify the empty chart, all six month labels, absence of plotted/sample values and equal-height grid classes. This supersedes the independent-height layout described above.

### Project-edit form follow-up

The project header now opens the existing prefilled ProjectForm in the shared modal, with an outline Edit trigger and consistent Save/Cancel/X controls. The legacy `/projects/[id]/edit` route redirects administrators to the project-detail modal; other roles return to the permitted detail page without an edit form. Cancel from a deep link retains the active section/report page. Successful saves explicitly revalidate project details and the dialog is keyed to the persisted update timestamp to reset after a saved update. Typecheck, lint and 24 isolated role/section renders, including edit prefill/visibility and legacy-route authorization redirects, pass. Live saves remain subject to the authenticated testing gate below.

There was no authenticated live-account browser session in this task. Diagnostic rendering is not proof of database saves, Storage permissions, RLS denial behavior, transaction concurrency, or deployed UI parity. No migrations, seeds, Git commits or deployments were performed. Retain the release-readiness gate until database-backed workflows and real-account browser UAT have passed; do not mark the entire Package 3 contract complete from a passing build.
