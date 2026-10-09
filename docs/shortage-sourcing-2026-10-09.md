# Out-of-stock material workflow (2026-10-09)

Out-of-stock reports now live under **Requests → Out-of-stock reports**. Existing `/requests/missing` bookmarks redirect there. Supplier price comparison remains available from **Suppliers → Compare prices**, while its separate sidebar entry has been removed.

1. An assigned Engineer or Foreman reports a missing material for a project site and source warehouse.
2. Admin may select an existing catalog material or add one, then create a supplier purchase linked to the report. A saved supplier quotation is optional. Purchases above ₱50,000 still require audited Admin owner approval.
3. Warehouse Staff inspects each delivery and receives accepted quantities into the source warehouse. Partial receipts are supported. Receipt never creates site stock automatically.
4. Admin creates one or more linked site requests, up to the reported quantity and available warehouse stock. The Engineer must approve each request, which reserves stock.
5. Warehouse Staff dispatches approved quantities with delivery details. Assigned site staff inspects and accepts the delivery. The existing inventory and cost ledgers record each movement.

The report shows linked purchases and site requests. Rejected, cancelled, or partially approved site requests reopen the report so Admin can submit the remaining quantity. Pending requests count against available warehouse stock to avoid creating more review requests than the report's current stock can support. A report with a site request or active purchase cannot be dismissed. The supplier comparison page is retained because current and historical prices are in scope.

Apply `supabase/migrations/20261009120000_shortage_to_site_requests.sql` **before** deploying the matching web application. It adds purchase/report linkage and an audited report-to-request conversion command. It does not rewrite prior stock or purchase records. Existing mobile installations need no new client build for the catalog inventory listing: the server response now includes active materials with zero balance at the assigned site.

Verification: TypeScript, ESLint, production build, mobile and domain tests, migration version check, and 35 isolated real-PostgreSQL workflow checks pass. The new check covers all five roles, denied writes, idempotent retries, wrong warehouse/material, the ₱50,000 approval gate, partial supplier receipt, Engineer review, dispatch, site acceptance, and rejection recovery. Hosted migration, deployed UI, and physical-device acceptance remain to be checked after rollout.
