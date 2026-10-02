# ERP workflow repairs — 2026-10-03

This implements the five repairs authorized after the role review. The existing construction ERP and newest-purchase-batch costing policy remain the scope. There is no new payroll allocation, progress weighting or accounting policy.

## Changes

1. Shared project/site role checks drive web review controls, mobile capabilities and SQL commands. Active/onboarding and matching-role rules apply to project and warehouse assignments. Request receipts check the actual receiving site before retry handling; authenticated callers must use inspection. Vehicle searches and manifests respect asset scope. Assigned-site project documents are readable. The upload policy now accepts canonical UUID paths and references the storage object's name explicitly. Generic return receipts have a valid status enum and reject changed-payload retries.
2. Admin corrections require a reason and retry key. Originals remain unchanged. Consumption reversal restores its exact allocations and removes that original use from net project costs. PO receipt reversal removes the original purchase batch and reopens order quantities. Site receipt reversal removes its received batches and returns quantity/value to transit, reopening receiving. Stock, valuations, PO and transfer projections update atomically. An unavailable original batch or reserved stock stops the entire correction. Corrected receipts can reuse their physical delivery reference; a locked-line guard prevents duplicate live receipts. Request, PO and inventory histories show corrections.
3. Direct site Engineers can review requests/reports, save material plans, and record progress for approved reports. Self-review remains denied. Finance can read project attendance and costs. Site roles no longer see an inaccessible global Attendance link.
4. Expected deliveries have search and server pagination. Billable projects and company vehicles use searchable paged pickers with stable ordering and counts. The former 500-record caps are removed. Project list pagination has a stable ID tie-breaker.
5. `npm run test:erp-workflow` creates and removes a disposable database and uses simultaneous independent PostgreSQL sessions. It covers five roles, sibling-site denial, document/storage RLS, reviews, partial approval/dispatch/receipt, retries, stock use/return/correction, PO reconciliation, attendance privacy/costs, billing limits, searches beyond 500 records and ledger/balance/value/batch reconciliation.

## Migrations and rollout

Apply these forward migrations in order on isolated staging before deploying their web consumer:

- `20261003100000_role_permission_consistency.sql`
- `20261003110000_searchable_operation_choices.sql`
- `20261003120000_audited_inventory_corrections.sql`

Paged RPC signatures replace their no-argument definitions; optional defaults preserve first-page calls and responses now include `total_count`. The last migration requests a PostgREST schema reload and removes the obsolete private reversal chain. Historical migrations remain untouched.

No hosted migration, production reset or deployment was performed. Before release, back up, apply to staging, rerun the Supabase mode below, and complete `TESTING-GUIDE.md` with signed-in web/mobile accounts. Production changes retain the repository's approval and backup requirements.

## Reproducing database tests

Default mode requires a dedicated local PostgreSQL cluster listening at `127.0.0.1`, owned by `erp_test_admin`. It uses a generated `erp_test_<uuid>` database, removed in `finally`, applies all 93 ERP migrations, and loads fictional seed data. Its Auth/Storage schema adapter is a SQL contract fixture, not an HTTP service emulator. Portable PostgreSQL lacks `pg_cron`/`pg_net`: cron registration is skipped and existing guarded extension failures are tolerated. Notification delivery is not tested.

PowerShell with the portable runtime prepared for verification:

```powershell
$env:ERP_TEST_PG_BIN='D:\Client-Project\.erp-postgres-test\runtime\pgsql\bin'
$env:ERP_TEST_PG_PORT='55439'
Remove-Item Env:ERP_TEST_BACKEND -ErrorAction SilentlyContinue
$erpPgStart = Start-Process -FilePath "$env:ERP_TEST_PG_BIN\pg_ctl.exe" -ArgumentList @('-D','D:\Client-Project\.erp-postgres-test\data','-l','D:\Client-Project\.erp-postgres-test\server.log','-o','"-h 127.0.0.1 -p 55439"','start','-w') -WindowStyle Hidden -PassThru
if (-not $erpPgStart.WaitForExit(15000)) { throw 'Local test PostgreSQL did not start in time.' }
npm run test:erp-workflow
```

The cluster must already be running on that loopback port. The runtime is outside the application repository and installs no Windows service. Stop it with `pg_ctl -D D:\Client-Project\.erp-postgres-test\data stop` after use.

For a clone of the local Supabase database, start the repository's local Supabase stack with fictional fixtures. This uses actual Supabase database schemas/roles and applies missing forward repairs only to the disposable clone:

```powershell
$env:ERP_TEST_BACKEND='supabase'
npm run test:erp-workflow
```

It refuses remote Docker hosts and Supabase URLs. Hosted credentials and the original database are not used for writes. Existing concurrency, reservation and mobile integration scripts now use manifest dispatch and inspected receipt rather than revoked legacy commands.

## Evidence and limits

- TypeScript, ESLint, production build and 67 unit tests pass.
- 93 migration versions are unique; the complete ERP chain loads on PostgreSQL 17.11.
- Existing costing suite: 25 scenarios pass. Existing PO receiving suite: 12 checks pass.
- Expanded PostgreSQL suite: 20 workflow checks across five roles, with concurrent sessions and fixtures exceeding 500 projects, deliveries and vehicles.
- Supabase clone mode was attempted and blocked by `spawnSync docker ENOENT`: Docker is absent on this host. Supabase HTTP/Auth/Storage and browser/device acceptance remain unverified. Item 5 is therefore not fully accepted as an isolated Supabase service test.
- Older receipts without recoverable exact batch snapshots need a separate audited reconciliation plan; the command refuses to invent costs. Request dispatch correction, daily-rate allocation across sites and project progress weighting remain unchanged.
