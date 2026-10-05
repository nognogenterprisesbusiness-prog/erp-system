# Client material flow review — 6 October 2026

## Purchasing screen corrections

All table column headings use 14px with a 20px line height and left alignment. Main cell data remains 14px; secondary references and status captions remain 12px.

Received purchase-order items show **Supplier Payment** as the workflow stage, independently of whether the balance is Unpaid, Partly paid or Paid. The pencil opens the existing Supplier Payment form directly on the purchasing list. It loads the whole order's unpaid balance in one batched RPC for the current page; a line's total is never substituted for that balance. Fully paid orders link to their payment history and existing audited void controls. Outstanding delivery pencils open the existing receipt form for Admin. Finance retains supplier-payment access without receiving authority. Site purchase review opens the receipt detail before approval; reimbursement remains distinct from supplier payment.

Posted quantities, costs and payments are not changed by selecting a stage. The pencil manages the existing operation; quantity/cost corrections preserve original entries and require the existing reasoned reversal, while payment corrections use Admin's reasoned void and replacement.

## Client notes checked against the current flow

| Client note | Existing implementation and evidence |
| --- | --- |
| Cement can come from City Hardware and other suppliers | A material SKU represents the same material and unit across suppliers. Each priced purchase batch retains its original supplier and price. Material detail shows total stock, location balances, and priced batches with their store. `20261005120000_batch_and_movement_suppliers.sql` supplies the batch/movement store trace. |
| Foreman requests for an individual project site | `/requests/new` records project, site, source warehouse, quantity and required date. Server capabilities and database commands check the actual site and warehouse assignments. Another assigned Engineer or Admin reviews; self-review is denied. |
| A project estimates 1,000 bags and requests smaller deliveries | `/projects/[id]/materials` distinguishes planned quantity, actual consumed quantity, on-site stock, available warehouse stock, outstanding requests and purchasing shortages. Approval can be partial; request detail shows Requested, Approved, Reserved, Dispatched, Received, approved loss/damage and In transit separately. |
| Show when delivery arrived, who delivered and which truck | Request detail has a dated actor timeline. Dispatch manifests require vehicle, driver and delivery reference. Site acceptance records receiver, actual accepted quantity, inspection condition and quality note. Dispatch and acceptance are separate postings. |
| 300 arrive, 100 are used, 200 remain | Site receipt adds the accepted 300 to site stock. Recording 100 actual consumption leaves 200 and charges only that consumption to project material cost. If 300 were dispatched but only 100 were accepted, the remaining 200 are in transit, not consumed or silently received. |
| Engineer buys at a hardware store with a receipt | `/site-purchases` requires an assigned Engineer, store, receipt number/date/photo, item quantities/prices and payment source. Submission adds no stock. Admin or Finance checks and approves the receipt, posting once directly into that site at its receipt prices and updating store price history. Rejection needs a reason. Personal-money reimbursement has its own recorded reference. |
| One inventory total, but identify the warehouse supplying 100 | Balances and ledger entries remain per material and location. Inventory identifies the selected warehouse/site; material detail aggregates all accessible locations. Dispatch reduces only the chosen source and preserves quantity/value in transit until acceptance. |
| “Cement ni Ace Hardware is City Hardware” | This is a correction to real supplier/purchase data, not a rule that all Ace Hardware records should be renamed. Use the actual supplier's existing edit screen for a master-data name correction. Incorrect posted purchase attribution needs its original record identified and an audited correction; historical purchase snapshots must not be silently rewritten. No company records were changed during this verification. |

Example: Warehouse 1 has 1,000 bags and Warehouses 2 and 3 each have 500, for 2,000 in warehouses. Dispatching 100 from Warehouse 1 leaves 900 there, 1,900 across warehouses and 100 in transit. Site acceptance moves that 100 to site stock. Company stock across warehouses, sites and transit stays 2,000 until material is consumed or an approved loss is posted.

## Remaining distinctions

- The seven-stage illustration includes formal supplier quotations, a spending threshold and a separate delivery-inspection stage for supplier POs. These are not implemented as a unified procurement pipeline. The project's existing purchase-history price comparison and simple Admin-issued PO process remain the supported flow; the screenshot's ₱50,000 rule is not enforced.
- Engineer purchases currently receive Admin/Finance approval after the purchase receipt is submitted. Pre-purchase spending approval and an additional Foreman acceptance after that approval are separate requirements if the client wants them.
- Warehouse-to-site request transfers already require site inspection. Supplier PO receiving records quantity, delivery reference/date and price/variance; it has no separate supplier-delivery inspection record.
- “CHV” and “quantity of op” do not identify a confirmed entity, unit or business rule in these notes. No behavior was invented from these fragments.
- Database verification uses a disposable local PostgreSQL database with fictional Auth/Storage contracts. Actual Supabase services and phone/browser acceptance still require their separate walkthrough.

## Verification

TypeScript, ESLint, production build and 73 unit tests pass. The complete disposable PostgreSQL suite passes 28 workflow checks across all five roles, including supplier payments, site purchase approval, batch/store tracing, partial deliveries, idempotency, denied commands and ledger/value reconciliation. The built stylesheet was loaded in a browser against conflicting legacy header classes: computed column headings are 14px with 20px line height and left alignment. This stylesheet check is not a signed-in payment submission or device acceptance test. No database migration is needed for these purchasing UI corrections.
