# Driver accounts, asset expenses and project budget display — 2026-11-08

## Scope delivered in source

| Area | Behavior |
| --- | --- |
| Equipment detail | Expense history (Admin + Finance). Admin records Fuel, Oil change, Maintenance, Repair or Other, and corrects an entry with a reasoned reversal. |
| Vehicle detail | Same expense history plus **Assigned drivers** (Admin). Existing project diesel receipts stay in their own section; they are not copied into the asset ledger, so each appears once. |
| Users → Drivers | Lists driver accounts with their current truck and reuses the existing invitation dialog (role fixed to Driver). Opening a driver shows the current truck and lets Admin assign, change or remove it. One truck per driver; a truck can have several drivers. |
| Projects → Finance | Leads with Approved budget, Actual costs and Remaining budget. Remaining = approved budget − posted project costs, computed in whole centavos (`projectBudgetPosition`); a negative balance is labelled **Over budget**. Contract value, profit, invoices and payments sit in a separate section. The **Manage costs & budget → Adjust approved budget** flow is unchanged. |
| Driver mobile app | Driver accounts open **My Truck**: assigned truck, **Add Expense** and **My Expenses**. Unassigned drivers see “Contact Admin to get a truck assignment.” A driver signing in on the web sees a page directing them to the app. |

## Data and access (`20261108090000_driver_role.sql`, `20261108090100_asset_expenses.sql`)

- `app_role` gains `driver` (own migration, because a new enum value cannot be used in the transaction that adds it).
- `driver_truck_assignments` (primary key `driver_id`) and `asset_expenses` (shared equipment/vehicle ledger: asset, submitter, request key, assignment, category, `numeric(12,2)` amount, Philippine date, notes, receipt path, reversal actor/time/reason). Both tables have audit triggers.
- Writes only go through security-definer RPCs: `set_driver_truck` (Admin), `post_asset_expense` (Admin or the assigned driver), `reverse_asset_expense` (Admin), plus `get_my_truck` for drivers. Authenticated users have `select` only, under RLS: Admin and Finance read every expense; a driver reads only their own. Assignments are Admin-only; drivers read their own through `get_my_truck`.
- `post_asset_expense` is idempotent per (submitter, request key). A matching retry returns the original id, including after reassignment or reversal; a changed retry is rejected. A driver submission must carry the assignment id the form was opened with. The assignment row is locked `for share`, so a concurrent reassignment either waits for the expense or makes it fail with “Truck assignment changed”. The API maps that error to HTTP 409, and the app then refreshes the truck.
- Receipts use the private `erp-asset-expense-receipts` bucket (WebP, 3 MB, path `<uid>/<request key>/receipt.webp`, upload into one's own folder only, no update/delete). Photos pass through the existing `prepareRecordPhoto` WebP pipeline.
- Asset expenses never post project costs. Existing diesel receipt approval/posting rules are unchanged.
- Roles that previously used `enum_range(app_role)` ("any role") now list the five staff roles explicitly, so drivers get no catalog, profile, notification or QR access. `guard_mobile_api` admits drivers, and the mobile API limits them to `session`, `driver` and their own `driver/receipt/{id}`.

## Verification (local, 2026-11-08)

| Check | Result |
| --- | --- |
| `npm run test:asset-expenses` (new, isolated PostgreSQL) | 8 groups passed: Admin-only assignment, one truck per driver, shared trucks, unassigned driver; concurrent retries create one row; invalid amount/date/category/notes; reassignment/removal rejects an open form; cross-truck and staff-role denial; concurrent reassignment serialized; equipment vs vehicle histories separate; project profitability and additional expenses unchanged; driver read isolation (expenses, profile, roles, assets, catalogs, projects, notifications, audit, direct writes); receipt folder/read isolation; audited Admin-only reversal and retry after reversal |
| Regression DB suites | `test:erp-workflow` (42), `test:mobile-integration`, `test:project-costs` (12), `test:vehicle-fuel`, `test:simple-mobile-requests`, `test:mobile-itemized-purchases` passed |
| Web | TypeScript, ESLint, `test:all` 126/126 (incl. budget ₱0/under/over and expense input tests), `test:mobile` 24/24, 137 unique migration versions, production build |
| Mobile (`../nognog-mobile`) | TypeScript, ESLint, 25 tests, Android/iOS bundle export. Contract archive `vendor/nognog-domain-20261108-asset-expenses.tgz` repacked: the earlier archive took the category *labels* (“Fuel”) as enum values and would have been rejected by the server. |

## Not yet verified — release gates

- **Hosted database state (read-only probe, 2026-11-08):** `20261108090000` and `20261108090100` are already applied to the hosted project, but `20261012160000_simple_mobile_equipment_requests.sql` is **not**. Its `submit_mobile_equipment_request` is missing, so every mobile equipment/vehicle request fails with “This operation is not enabled in the ERP database yet”. Apply `20261012160000` (self-contained; no later migration redefines its objects), then the new follow-up `20261108090200_asset_expense_hardening.sql` (assignment lock, date floor, audit triggers). `20261108090100` is kept identical to the applied version. No mobile build was produced.
- Phone acceptance: driver invitation and first sign-in, assignment, reassignment while the form is open, unassigned sign-in, expense with and without a receipt photo, camera/library denial, and denial of another driver's records and of staff screens.
- Browser check of the Drivers, Equipment, Vehicle and Project Finance screens at ₱0, under budget and over budget.
- **Release order:** installed mobile builds before this release reject the `driver` role in the session response and show a generic error. Invite drivers only after they install the new build, or raise `MOBILE_ANDROID_MIN_BUILD` once it is published. Foreman and Engineer sessions are unaffected.
