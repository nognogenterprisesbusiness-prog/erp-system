# Navigation and client requirements review — 7 October 2026

## Recommendation

Simplify entry points instead of deleting stock, costing, history or payment features. The client's daily focus is project/site material requirements, warehouse stock, request approval, delivery/inspection, actual use, supplier receipts and prices. The Admin sidebar currently exposes setup and review tools beside those daily workflows.

| Daily navigation | Keep inside that workspace |
| --- | --- |
| Overview | Role-specific summary and urgent work |
| Projects | Sites, material plan, progress, project documents, labour, attendance and costs |
| Inventory | Location picker, material details, stock history, transfers, counts, equipment and vehicles |
| Requests | Site request, approval, warehouse release, truck/driver, partial receiving and timeline |
| Purchasing | Warehouse POs, supplier payments, Engineer site purchases and receipt approval |
| Suppliers | Store details, purchase history and Compare prices |

Move Categories, Asset classifications, Users and Audit logs into their respective setup screens or an Administration/Settings area. Put QR scanning in Inventory and Requests as a contextual action. Put Documents under a project, with the existing global document management screen available from Projects. Staff/attendance navigation belongs under project Labour or a People workspace when relevant. Billing remains in Finance; it is a quoted feature and should not be deleted merely because the current discussion focuses on materials. These are recommendations, not applied navigation removals.

Role menus should follow real work:

- Warehouse Staff: Inventory, Requests, Receive deliveries and Warehouses. Receiving is daily work and should remain prominent for this role.
- Engineer: My projects/sites, Requests, Site purchases and Daily reports; site stock/use are contextual project actions.
- Foreman: My sites, Requests and Daily reports; receipt, stock use and attendance actions are available for the selected assigned site.
- Finance: Purchasing/site purchase approvals, Suppliers, Billing/payments and authorised cost/attendance review.
- Admin: the six main workspaces above, Finance where required, and a separate Administration area.

## Client notes

The [detailed material-flow review](client-material-flow-review-2026-10-06.md) already includes the client's supplier, site estimates, partial requests/deliveries, truck/driver timeline, receipt inspection, Engineer hardware purchases, supplier prices and stock-by-warehouse notes. It distinguishes 300 received minus 100 consumed = 200 on site from 300 dispatched minus 100 accepted = 200 in transit. Different suppliers share the material SKU but retain their original priced batches and supplier trace.

“Ace Hardware should be City Hardware” requires identifying the real supplier/purchase record. No automatic rename or historical price rewrite has been performed from an ambiguous note. “CHV” and “quantity of op” still do not define a confirmed unit, entity or rule.

The current Engineer purchase flow is buy → submit receipt/photo → Admin/Finance approve → site stock. It does not include a pre-purchase spending approval or an additional Foreman receiving step after that approval. Formal supplier quotations, a ₱50,000 approval threshold and a separate supplier-PO inspection stage are also not implemented as the screenshot's full seven-step pipeline. Current warehouse-to-site request receipts already require inspection.

## Recheck result

The recent five-role database suite passes 28 checks for the shared ledger/stock/costing flows. This review also found and repaired the mobile site-purchase upload handler being in GET while the app sends POST. [Conditional mobile updates](mobile-compatibility.md) now protect actual incompatible API contracts while preserving compatible older clients.

The core material rules match the implemented scope. They are not a blanket statement that every proposed feature or every device workflow is accepted: authenticated HTTP receipt upload, phone installation, native camera/upload UX and the unresolved client requirements above remain open.
