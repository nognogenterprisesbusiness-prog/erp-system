# Simple supplier and vehicle setup

Approved change, 2026-10-09:

- Supplier categories no longer have a screen, navigation item, filter, form field or application query. Their write commands are removed and authenticated table access is revoked. Old links redirect to Suppliers. Historical category rows and supplier links remain for data retention.
- Employee categories remain available to Admin through the Categories button on Employees, instead of a separate sidebar entry. Workforce assignments, rates and attendance remain intact.
- Vehicles use a free-text type instead of a fixed classification. The main form asks for name, type, plate and current location. Code is generated when blank. Ownership, operational status, notes and photo are optional details with established defaults.
- Brand, model, acquisition date, manufacture year and mileage are no longer required for vehicle entry. Existing values are preserved during edits. Equipment keeps its existing required details and equipment categories.
- Registry edits remain Admin-only. A checked-out vehicle must go through the existing return workflow before its registry can be edited. Requests, handovers, usage costing, delivery tracking, QR codes and audit history remain supported.

## Rollout

Apply `supabase/migrations/20261009140000_simple_supplier_and_vehicle_setup.sql` before deploying the web change. The migration backfills existing vehicle types from their historical category names, changes only vehicle field requirements, and preserves historical supplier/vehicle data. It retires the old vehicle command signature and installs the matching simplified command. No hosted database migration is performed by local verification.

The existing vehicle subtype constraint runs immediately during backfill, then returns to deferred mode. This prevents PostgreSQL error `55006` when subsequent table changes follow updates to existing vehicles. A failed run of the transaction rolls back; use the corrected complete migration when retrying.

These are web setup changes; the Engineer/Foreman mobile API contracts are unchanged, so they do not require another native build or mandatory app-update prompt.

## Verification

Passed locally: 37 PostgreSQL workflow checks across all five roles, 85 automated tests, 108 unique migration versions, TypeScript, ESLint and the production web build.

`npm run test:simple-setup-upgrade` also reproduces the original pending-trigger failure on a populated database, verifies rollback, and applies the corrected migration while checking vehicle types, legacy details and employee categories. Use the same local `ERP_TEST_PG_BIN` setting as the workflow suite.

The local PostgreSQL workflow suite covers all five roles and adds checks for free-text vehicle creation, generated codes, duplicate plate rejection, required fields, unauthorized writes, metadata preservation, checkout protection, return and audit events. It also verifies that supplier categories cannot be managed and historical supplier links remain readable. The full workflow covers material stock, reservations, approvals, inspected receipts, partial deliveries, corrections and financial reconciliation.

Signed-in browser acceptance and hosted deployment remain separate release checks. Local portable PostgreSQL uses fixture Supabase Auth/Storage schemas; it does not verify the hosted services themselves.
