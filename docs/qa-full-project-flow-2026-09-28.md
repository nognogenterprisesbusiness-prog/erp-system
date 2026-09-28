# Hosted QA: equipment hours and complete project workflow (2026-09-28)

Executed against the authorized staging Supabase project using the four existing test accounts. No schema changes or deletions were made. Test-owned business records remain in staging and are labeled with `QA-E2E-2026-09-28-*`.

## Results

- All four accounts authenticated with the expected Admin, Engineer, Foreman and Warehouse Staff roles.
- A fresh QA equipment asset was registered at the QA site, given a dated ₱500/hour rate, and used for 0.5 hours by the Foreman. The database recorded ₱250 with the correct project/site and rate snapshot. Replaying the same idempotency key returned the same usage record; no duplicate cost was posted.
- One continuous workflow passed: supplier-priced purchase order → warehouse receipt → Foreman material request → Engineer approval → Warehouse dispatch → Foreman site receipt → one-bag consumption → equipment-hours posting → report links and Engineer approval → invoice → partial payment → project profitability reconciliation.
- Material stock reconciled: purchase +3, dispatch −2, receipt +2, consumption −1; warehouse and site balances each increased by one bag for the fresh run.
- Project costs reconciled on the latest fresh run: materials ₱525.50 → ₱636.23, labor remained ₱1,600, equipment ₱1,000 → ₱1,250, and total posted costs ₱3,125.50 → ₱3,486.23. The ₱360.73 increase equals the ₱110.73 posted material consumption plus ₱250 equipment usage. Linking records to the report did not post costs again.
- Billing reconciled: invoice +₱100, payment +₱40, receivable +₱60.
- Supplier price version and unit price were checked against the purchase-line snapshot; the report was confirmed approved.

The one-off QA runner used for this pass was removed after the successful run, as requested. The labeled records and reconciled results remain documented here; reruns should use the existing role-workflow QA suite or an explicitly reviewed test runner.

## Scope still not certified

This closes the two requested workflow checks, not all Package 3 acceptance. Hosted pagination beyond 1,000 records and full-company operational acceptance remain unverified. The first runner attempt stopped on an intentionally restricted direct `inventory_transfer_items` read; the test was corrected to use the role-scoped request-dispatch record, and the interrupted QA request/transfer was completed and reconciled. That initial error was in the QA harness read path, not an app workflow failure.
