# Performance and form guidance — 2026-10-09

## Approved scope and behavior

Staff keep the existing purchasing, requests, inventory, attendance and financial flows. Equipment categories are retired in favor of the existing free-text type. Employee categories remain on Employees. No stock, audit, supplier price, cost or payment history is deleted.

Web entry forms receive visible guidance through the shared FormField and PesoAmountInput components and the remaining custom form wrappers. Examples explain warehouse and asset codes, names, quantities in their unit, unit prices, dates, contacts, reviews, document names and attachments. Existing field-specific hints take priority; errors replace generic guidance. Purchasing lines share one example below the rows, preserving alignment. File fields retain their specific format and size instructions. Search and checkbox controls do not receive generic entry guidance.

Text inputs, dropdown triggers and date triggers default to 44px. Labels and controls use start-aligned grid wrappers so wrapping guidance stays below its control. Action buttons use the existing pill style, including New site purchase, purchasing line actions, theme controls and calendar actions. Navigation tabs and picker options retain their established design.

## Supabase changes

- `get_dashboard_project_counts` replaces three exact-count HTTP queries with one aggregate over the same visible, unarchived projects. It uses security invoker, requires authentication, and preserves project RLS. It returns zero counts for an empty visible set and rejects anonymous callers.
- Supplier and workforce reference loaders use React request-scoped memoization, matching existing inventory/location loaders. There is no persistent or cross-user cache of protected data.
- Equipment registries no longer fetch category records or run category joins. Types come from their existing subtype records.
- Stock reservations, balance locking, once-only commands, receipt inspections, current-value calculation and historical cost snapshots remain unchanged.

There has been no hosted query-plan, database-size or deployment-usage audit. Existing bounded pagination, role filtering and Realtime reconnect fallback remain in place. Do not add blanket indexes or remove reconciliation/audit data merely to reduce a hosting metric.

## Vercel Function Storage

[Official Vercel documentation](https://vercel.com/docs/deployment-storage) defines this as retained deployed Function bundles, including their regions and retention. It is separate from Supabase database and object storage. The reported 3.21 GB / 10 GB does not itself demonstrate a database leak. Repeated retained deployments can increase it; billed period usage does not vanish immediately after a bundle reduction.

The production configuration optimizes Hugeicons package imports and excludes the unused Sharp WASM fallback from traced server dependencies. Windows and Vercel Linux use native Sharp; required native packages remain in the lockfile. Do not install with optional dependencies omitted. A future WASM-only runtime would need a different tracing configuration.

Local build trace comparison (same Windows installation, unique union of `.next/server/**/*.nft.json` dependencies):

| Measurement | Before | After |
| --- | ---: | ---: |
| Unique traced dependencies | 21.50 MiB | 12.74 MiB |
| Largest route dependency trace | 14.05 MiB | 5.27 MiB |

These are uncompressed local build traces, not Vercel's per-function regional packaging or billed GB-months. Native image validation and conversion tests pass. Review deployment retention in the account after rollout; shorter retention trades rollback history for lower retained storage. No old deployments, production files or backups were deleted.

## Rollout and verification

Apply these after the already-corrected 1400 migration, before deploying this web update:

1. `supabase/migrations/20261009150000_retire_equipment_categories.sql`
2. `supabase/migrations/20261009160000_dashboard_project_counts.sql`

Local verification: 88 automated tests; 39 PostgreSQL workflow checks across all five roles; populated upgrade regression; 110 unique migration versions; TypeScript, ESLint and production build. The workflow checks include role-scoped dashboard counts, equipment custody and returns, denied access, concurrent stock postings, partial deliveries, retries, corrections and financial reconciliation.

No hosted migration or authenticated browser/device acceptance was performed. Check the deployed Admin equipment form, dashboard counts, warehouse code guidance, purchase line alignment and Engineer/Foreman stock flows after migration and deployment. Mobile endpoints and native code are unchanged; this release does not require rebuilding or forcing mobile users to update.
