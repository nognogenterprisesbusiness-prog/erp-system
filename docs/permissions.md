# Five-role permissions

Current roles are `admin`, `engineer`, `foreman`, `warehouse_staff` and `finance`. Permissions require an active, onboarded account. Historical role names are not current application roles.

| Workflow | Admin | Engineer | Foreman | Warehouse Staff | Finance |
|---|---|---|---|---|---|
| Projects/sites | All; manage | Assigned projects/sites | Assigned projects/sites | Approved-request context from assigned warehouses | Financial project views |
| Project documents | Upload, rename, delete, read | Read assigned-project documents, including direct site assignments | Same assigned-project read | None | None |
| Material requests | Review/cancel as authorized | Request; independently review assigned sites | Request; cancel own undispatched requests | Dispatch approved requests from assigned warehouses | No decisions or dispatch |
| Delivery acceptance | Inspect/receive | Inspect/receive at assigned sites | Inspect/receive at assigned sites | Receive issued PO deliveries and returns at assigned warehouses | No receiving |
| Site consumption | Post and correct | Post at assigned sites | Post at assigned sites | No site consumption | Financial reporting |
| Consumption/receipt corrections | Reasoned, audited reversal; replacement through normal workflow | None | None | None | Financial history |
| Material planning/progress | Save; progress against approved reports | Save plans and approved-report progress at sites with review authority | Read assigned-site plans/progress | None | Financial summaries |
| Attendance | Post/correct/read costs | Assigned-site operational view without wages | Record assigned-site attendance without wages | No global attendance | Read attendance/costs; no posting/correction |
| Invoices/collections | Issue, collect, void/correct as authorized | None | None | None | Issue/collect within financial limits |
| Accounts, procurement, wages/rates | Manage through protected commands | No management authority | No management authority | Quantity-only PO receipt at issued price | Financial read and billing authority |
| Purchasing and inventory read | All | Assigned sites' stock; no prices or costs | Assigned sites' stock; no prices or costs | Assigned warehouses' stock; no prices or costs | Read-only: purchase orders, receipts, suppliers, prices, stock and value at every location, movement and per-material project costs |

`private.project_site_role` matches the project/site pair and either a direct site assignment or an active project assignment with the same current account role. Admin can access historical inactive sites; posting commands validate operational statuses separately. Warehouse access requires an active Warehouse Staff role and warehouse assignment, or Admin.

Web reviews, mobile capabilities and SQL review commands use the same site helper. Request receipt authorization runs before retries and checks the receiving site. Authenticated clients cannot execute the legacy receipt command; inspection is the supported request receipt entry point. Vehicle choices and manifests respect asset scope.

Corrections append `inventory_corrections` and a linked reversal. Original quantities, costs, inspections, actors and timestamps remain intact. Used or reserved receipt stock must be restored first. Receipt reversal reopens PO/transfer quantities without changing approval/dispatch history. Request-bound dispatch reversal remains unsupported because reservation restoration is a separate workflow; the UI does not offer it.

Global Attendance navigation is Admin/Finance only. Site attendance remains accessible through assigned projects. Finance's project attendance page omits Admin posting/correction controls.

Database role boundaries are tested with real concurrent PostgreSQL sessions. Supabase HTTP/Auth/Storage, Realtime delivery and signed-in web/device acceptance remain release gates. See [verification notes](erp-workflow-implementation-2026-10-03.md).
