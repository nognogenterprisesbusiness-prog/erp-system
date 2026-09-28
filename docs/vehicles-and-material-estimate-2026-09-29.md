# Vehicle project use and material cost estimate (2026-09-29)

Migration: `supabase/migrations/20260929100000_vehicle_project_use_and_material_estimate.sql`. It must be applied before deploying the matching web and mobile code, because the web request page reads the new `asset_kind` column from `get_requestable_equipment`.

## Vehicles tracked against projects

Vehicles now use the existing equipment workflow. No new screens or approval steps were added.

| Step | Who | Where |
|---|---|---|
| Request a vehicle for a project site | Assigned Engineer / Foreman | Web **Equipment requests**; mobile **Request Equipment or Vehicle** |
| Approve, check out, return | Admin | Web **Equipment handovers** |
| Set the hourly rate | Admin | Project **Costs** → *Set equipment or vehicle hourly rate* |
| Record hours used | Assigned Foreman / Admin | Project page *Record equipment hours*; mobile **Equipment & Vehicles** |
| See usage and cost | Admin | Vehicle detail → *Project usage and cost*; project Costs; profitability |

Pickers label vehicles as `CODE · Name · Vehicle` via the shared `assetChoiceLabel` / `vehicleTag` helpers in `@nognog/domain`. Vehicle cost is posted in the existing equipment cost category, and the same rules apply: rate snapshot, idempotency, 24-hour limit, no future dates and audited handover. Checked-out vehicles now need the same audited return as equipment. Fuel and mileage logs are still out of scope.

## Material cost estimate

`get_project_material_estimate(project)` (Admin only) prices each material plan line:

1. The latest current supplier price for the material in its base unit (PHP), from active suppliers. The newest effective date wins; on a tie, the lowest price wins. This matches the client's cement example: ₱100, then ₱120, and new plans use ₱120.
2. If there is no supplier price, the average stock cost at the plan's warehouse.
3. Otherwise the line shows **No price yet**.

The project **Material plan** page shows each line's estimated cost and price source, the estimated material total, and the approved budget remaining (or overspent) after materials. The estimate is read-only guidance: it posts no cost and does not change the budget. Engineers and Foremen still see quantities only. The mobile app shows no costs, consistent with its Foreman/Engineer money restrictions.

## Verification

- ERP: typecheck, lint, 63/63 unit tests, 72 unique migration versions and the production build passed. The new SQL and all six PL/pgSQL bodies parsed with PostgreSQL's parser (pglast).
- Mobile: typecheck, lint, 7/7 tests passed.
- **Not yet executed against a database.** On staging, check: vehicle request → approve → check-out → set rate → Foreman hours → cost on the project → return. Also check an estimate using a supplier price, a stock-cost fallback and an unpriced line, and that non-Admin access to the estimate RPC is denied.
