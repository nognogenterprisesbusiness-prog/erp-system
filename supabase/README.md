# Database changes

`migrations/` is the immutable upgrade history for existing installations. It is not a collection of sample tables to trim. Apply files in version order; do not delete or edit an applied migration to make the folder smaller. Current tables/functions are the result of the complete chain, including policies, grants, indexes, triggers and reversals.

The staff-read update is `20261112170000_scalable_staff_reads.sql`. It adds server-filtered attendance and complete payroll aggregates, with Admin/Finance checks. It does not rewrite business transactions or remove tables.

Use the repository isolated PostgreSQL fixture to validate the full chain against fictional data. `node scripts/test-scalable-staff-reads.mjs` verifies >1,100 employees, global search, pagination and denied roles. `npm run test:migrations` checks migration versions.

A future baseline/squash must be a separate verified deployment: compare clean-install schema including RLS/grants/functions with an upgraded database, back up deployed databases, reconcile migration history, then adopt the baseline for new installs. Never replace deployed history with only CREATE TABLE statements or production data rows. Row data is not migration cleanup.

The 13 November registry/chart update is `20261113100000_scalable_registry_and_chart_reads.sql`. It adds RLS-preserving location search, unreversed monthly consumption aggregation, and a partial date index. Apply before deploying the dependent web changes. Validate with `node scripts/test-scalable-registry-reads.mjs` using the local fixture. The user confirmed staging application on 13 November 2026; five-role live search and chart reconciliation checks passed.
