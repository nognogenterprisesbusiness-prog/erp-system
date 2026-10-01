# Newest-batch-first material costing — 2026-10-01

## Client rule

Each purchase received into stock is a batch with its own price. When stock is used, released, lost or returned, the newest batch is used first. When that batch runs out, the next newest is used. Prices are never averaged.

| Received | Then used | Cost charged |
|---|---|---|
| 1,000 pcs at ₱100, then 1,000 pcs at ₱200 | 1,000 pcs | ₱200,000 (all from the ₱200 batch) |
| same | next 500 pcs | ₱50,000 (from the ₱100 batch) |
| 1,000 pcs at ₱100, then 2,000 pcs at ₱150 | 2,500 pcs | ₱350,000 (2,000 × ₱150 + 500 × ₱100) |

Project material cost is still posted when the Foreman or Engineer records site use (D06). Releasing or receiving stock moves batches. It does not charge the project.

## How it works

- `inventory_cost_layers` holds the batches at each warehouse, site and in-transit transfer line. `inventory_valuations` remains the location total that dashboards, counts and reports read; every movement checks that the two agree and rejects the movement if they don't.
- A release from the warehouse takes the newest batches, and they travel with the transfer. The site receives them with their original purchase prices, so the site also uses the newest purchase first.
- "Newest" means the latest receipt date; a receipt entered late with an earlier date is not treated as newest.
- `inventory_cost_allocations` records exactly which batches each movement used. A reversal puts back those same batches.
- A posted cost never changes. A new purchase or supplier quote only affects stock used afterwards.
- Supplier quotes do not create batches. Only a received purchase or stock-in with a cost does.

## Existing stock

Stock on hand before this change was valued at an average, and its purchase history cannot be split back into batches without rewriting posted costs. Each location's existing quantity and value become **batch 0 (carried forward)** at that average. Batch 0 is used after every newer purchase. Verifying an opening value or a legacy in-transit value also creates batch 0.

## Where to see it

- **Material page → Price batches** (Admin and Finance): each location's batches, unit price, remaining quantity and value, and which batch is used next.
- **Project → Materials**: the plan estimate uses the latest supplier price, else the price of the batch that would be used next.
- Transaction cost and unit cost on each movement show the combined price of the batches it used.

## Also fixed

Approving a transit loss (`approve_transfer_variance`) assigned a text value to the transfer status enum and always failed. No variance had been approved on the hosted database. The new version casts the status, as the receipt commands already did.

## Rollout

1. Back up the database (Supabase dashboard → Database → Backups) and note the restore point.
2. Run `supabase/migrations/20261001100000_latest_batch_costing.sql` in the SQL Editor as one query. It locks the valuation tables briefly, backfills batch 0 and replaces the costing trigger. It is safe to rerun.
3. Check: `select count(*) from public.inventory_cost_layers;` returns one row per valued location or in-transit line with stock.
4. Deploy the web app (the material page reads the new batch view).
5. Walk through with test data: stock in 10 at ₱100, stock in 10 at ₱200, release 15 to a site, receive, record use of 10, and confirm the use costs ₱2,000 and the material page shows the remaining ₱100 batch as used next.

## Verification

- `npm run test:batch-costing`: 25 scenarios on in-memory PostgreSQL (PGlite). It loads the previous average-cost trigger, posts stock, applies the migration twice, then checks both client examples, partial receipt, transit loss, reversals of use and dispatch, legacy stock and transit, opening values, rounding to the centavo, date ordering, drift detection and the batch view.
- Not covered: real concurrent sessions, Supabase RLS for the five roles, and the hosted data's backfill. Run step 5 on the hosted database after the migration.
