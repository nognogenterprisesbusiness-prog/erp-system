# Phase 3A — Materials and inventory foundation

## Stage boundary

This stage implements the material catalog, categories, location balances, immutable movement ledger, stock in/out, dispatch/receipt transfers, and responsive inventory views. Material requests, approval hierarchy, reservations, request-bound warehouse release, consumption, valuation, returns, and project material costing remain outside this stage.

Phase 3B must not begin until the local database reset, pgTAP suite, concurrency test, and role-based responsive-web walkthrough all pass.

## Reused architecture

- Phase 1 Supabase Auth, profiles, roles, and role helpers remain authoritative.
- Phase 2 warehouses, project sites, assignments, and `inventory_locations` are reused; no duplicate location model was introduced.
- All stock changes execute through security-definer PostgreSQL commands. Client code has no insert/update/delete grants on balances or ledger rows.
- The ledger is append-only. Corrections use `reverse_inventory_transaction` and preserve the original movement.
- Quantities use PostgreSQL `numeric(20,4)`. Each material has one base UOM and posting commands reject mismatched units.
- Dispatch removes source availability immediately. Destination stock is added only when receipt is confirmed, so in-transit quantity is not double counted.

## Migration and commands

Migration: `supabase/migrations/20260922110000_phase3a_material_inventory.sql`

Atomic, idempotent commands:

- `post_stock_in`
- `post_stock_out`
- `dispatch_inventory_transfer`
- `receive_inventory_transfer`
- `reverse_inventory_transaction`
- catalog/category save and archive commands

The stock commands serialize competing writes with row locks. Idempotency receipts bind each UUID key to its actor and command.

## Access rules

- Admin and super admin manage catalog data, inventory, and reversals.
- Assigned warehouse staff can view and operate assigned warehouses.
- Engineers, foremen, and assigned project members can view authorized project-site balances.
- Accounting can view inventory reporting data.
- Direct site dispatch is restricted to administrators until the Phase 3B request and approval policy is approved.
- Reusable items can be cataloged but are not posted through the consumable stock flow until the custody workflow is approved.

## Verification

Run against local development Supabase only:

```powershell
npm run supabase:start
npm run supabase:reset
npx supabase status -o env
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_PUBLISHABLE_KEY = "<ANON_KEY from the status output>"
npm run test:inventory-concurrency
```

Then run application checks:

```powershell
npm run typecheck
npm run lint
npm run build
```

The pgTAP suite was removed for demo-focused development. Recreate catalog-constraint, idempotency, balance, transfer, partial-receipt, role-denial, and visibility coverage before live release. The Node concurrency test sends two simultaneous releases for the final available balance and requires exactly one to commit.

## Unresolved decisions

- D01: the exact material-request approval hierarchy is not approved, blocking Phase 3B.
- D02: ordinary warehouse release must be tied to an approved request; Phase 3A exposes only an explicitly referenced and audited direct stock-out operation.
- D04: reusable materials need a custody/asset workflow separate from consumable inventory.
- D05: inventory valuation is unresolved, so this stage does not store or calculate costs.
- D06: project material cost is recognized on consumption, which is Phase 3C and has not been implemented.
- D07: offline writes remain unsupported pending conflict-policy approval.
