# Receipt expenses and warehouse stock entry

Staff explicitly choose Receipt expense or Inventory materials. Receipt expense requires a site, total and private receipt photo; it creates no inventory line or supplier. Up to PHP 50,000 posts one project expense automatically; above that requires Admin approval. Inventory materials retain receipt review and site stock posting. Diesel remains a vehicle-linked expense. Retries, reimbursement and reversal never create a second expense.

Assigned Warehouse Staff can record verified valued stock-in at their warehouse, and dispatch direct deliveries to an active linked site with a reason. Dispatch removes source stock, acceptance adds destination stock, and later consumption posts project material cost. Assigned Engineer/Foreman count and accept direct deliveries on mobile (Inventory → Receive warehouse deliveries) or web Transfers. Partial receipts preserve the remaining quantity. Request-bound transfers still use request inspection; this change cannot bypass request reservations or fulfillment reconciliation.

Stock-history filters use the shared custom picker. The orphaned opening-values loading file is removed; historical migrations and ledgers remain intact.

## Apply in order

After previous migrations, apply:

1. `20261012180000_site_receipt_expenses.sql`
2. `20261012190000_warehouse_stock_entry.sql`
3. `20261012200000_direct_site_delivery_receipts.sql`

Deploy the matching ERP/API before distributing the paired mobile build. Web push remains held by the user. No hosted data or release minimum was changed.

## Verification

The new isolated PostgreSQL runner verifies ordinary receipt expenses, concurrent retries/approvals, owner threshold, reimbursement, reversal and no stock changes. It also verifies assigned-warehouse stock-in, direct dispatch, partial site acceptance, duplicate retries, excess-quantity rejection and denied roles/site access. Diesel checks pass separately. All 42 existing five-role ERP workflow checks pass, including reservation, concurrent releases, request inspection, costed use and stock/valuation reconciliation.

Web typecheck, lint, production build and migration validation (126 versions) pass. Mobile typecheck, lint, 25 tests, Android/iOS native exports and Expo Doctor (21 checks) pass. These are code/database checks; physical-device startup and hosted Auth/Storage/Realtime acceptance are still required.

The required-update panel is now a full-page screen before authenticated routes mount, using the existing React Native controls. The startup native Compose/modal path was removed. No affected-device crash log was available; this does not establish the device crash cause. Install the released new binary manually if an older one cannot open, and do not require that build before staff can download it.
