# Permission matrix

| Role | Project scope | Project mutation | Warehouse scope | Warehouse mutation |
|---|---|---|---|---|
| Super Admin / Owner / Admin | All | Create, edit, archive, assignments, sites | All | Create, edit, activate/deactivate, staff assignment |
| Project Manager / Engineer / Foreman / Worker | Explicit active project assignments | Read only | None unless separately assigned | Read only when assigned |
| Warehouse Staff | Explicit project assignments only | Read only | Explicit active warehouse assignments | Read only |
| Accounting | Explicit project assignments only | Read only | None unless separately assigned | Read only when assigned |

The responsive web interface hides unauthorized mutations for usability. Supabase grants and RLS policies remain authoritative. Mutation server actions also verify the administrator role before submitting changes.

Inactive profiles fail role and assignment checks. Ending an assignment preserves history and removes future scoped access. Project records are archived, never hard-deleted through the application API.

## Phase 4A asset registry

| Role | Asset registry scope | Registry mutation |
|---|---|---|
| Super Admin / Owner / Admin | All equipment, vehicles, classifications, and locations | Create, edit, relocate, status update, archive |
| Project Manager / Engineer / Foreman | Assets currently at explicitly assigned project sites | None |
| Warehouse Staff | Assets currently at explicitly assigned warehouses | None |
| Accounting | All asset registry records for reporting | None |
| Worker without an assignment | None | None |

Direct client writes to asset identities, subtype details, and history are revoked. Protected database commands and server actions re-check the administrator role. Assignment, transfer, usage, maintenance, and costing permissions remain deferred to Phase 4B/4C.

## Phase 5A workforce registry

| Role | Employee identity | Private contact | Project workforce | Labor rates | Mutation |
|---|---|---|---|---|---|
| Super Admin / Owner / Admin | All | All | All current/history | All | Categories, employees, archive, assign/end/transfer, add/close rate |
| Accounting | All | All | All current/history | All | None |
| Project Manager / Engineer / Foreman | Employees with workforce history on an accessible project | None | Accessible projects only | None | None |
| Linked Worker | Own employee identity | Own | Own assignment rows | Own | None |
| Warehouse-only / unrelated Worker | None | None | None | None | None |

A workforce assignment does not grant authenticated project access. If an employee also needs application access, an administrator must separately create the appropriate Phase 2 project assignment. Direct client writes to workforce tables and history are revoked; protected database commands remain authoritative.

## Phase 6A supplier management

| Role | Supplier registry | Catalog and price history | Mutation |
|---|---|---|---|
| Super Admin / Owner / Admin | All active and archived records | All materials, versions, comparisons, and events | Categories, suppliers, catalog entries, price add/close, archive |
| Accounting | All records | All materials, versions, comparisons, and events | None |
| Project Manager / Engineer / Foreman / Warehouse Staff / Worker | None | None | None |

Authenticated clients receive read-only table grants filtered by RLS. All mutations use validated security-definer database commands and repeat the manager-role authorization check in the server action. Phase 6A does not introduce an unapproved procurement role or purchase-order authority.

## Phase 7A daily reports

| Role | Report visibility | Create and submit | Edit draft |
|---|---|---|---|
| Super Admin / Owner / Admin | All projects | Any active project and site | Own drafts only |
| Project Manager / Engineer / Foreman | Projects with an active matching assignment | Assigned active projects and sites | Own drafts only |
| Accounting / Warehouse Staff / Worker | None | None | None |

Submitted reports and their snapshots are read-only. Later review and correction permissions require the approved Phase 7D workflow. The database command and project-scoped RLS enforce these boundaries independently of navigation.

## Phase 9A QR identification

| Role | QR registry and label management | Active-code resolution |
|---|---|---|
| Super Admin / Owner / Admin | List, generate, print/download, replace, deactivate, view history | All linked records |
| Other active users | No registry or label-management access | Material catalog records; assets only at accessible locations; warehouses and sites only within authorized assignments |

Resolution returns identifying metadata only. It does not grant stock, equipment, or project mutation rights. Inactive or replaced identifiers do not resolve. Browser camera scanning and inventory/asset transaction integration are not part of Phase 9A.

## Phase 10A notifications

| Actor | Notification access | Mutation |
|---|---|---|
| Active recipient | Own currently accessible project/warehouse notifications only | Mark own visible messages read, including mark-all |
| Recipient without current project/warehouse access | No longer sees related messages | Cannot mark hidden messages read |
| Admin/Owner/Super Admin | Own messages, including unrestricted project/warehouse scope | Same read actions; no browser-side notification creation |
| Database event processor | Outbox and recipient resolution across roles and active assignments | Creates recipient messages from trusted committed event records; retries and records failures |

Financial, labor, and attendance categories are additionally restricted to Admin/Owner/Super Admin/Accounting pending the approved module-specific rules. Authenticated users have no direct insert/update/delete grants on notification and outbox tables. Realtime uses recipient-filtered subscriptions and the table's RLS; it is not the source of truth.
