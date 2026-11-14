# Staff access and tutorial recording — 2026-11-14

## Current workspaces

| Account role | Start screen | Main responsibility |
|---|---|---|
| Admin | Company overview | Setup, approvals, protected corrections and account access |
| Engineer | Assigned-project overview | Independent reviews, site purchases and assigned-site work |
| Foreman | Assigned-project overview | Requests, receiving, material use, attendance and daily reports |
| Warehouse staff / Bodegera | Inventory | Receive and release stock at assigned warehouses |
| Finance | Financial overview | Purchasing review, billing, payments and payroll preparation |
| HR | HR overview | Employees, departments, worker assignments, attendance review and payroll preparation |
| Driver | My Truck in the mobile app | Assigned-truck expenses and own submission history |

These are personal accounts. Staff do not share the Admin login. A payroll department does not grant system permissions. Roles and project/warehouse assignments control access together. Existing account roles are unchanged; use Users → Add user → HR to invite an HR employee. Arbitrary per-button permission toggles and converting existing roles are not part of this update.

## HR boundaries

HR can maintain employee details, trades, departments and workforce assignments; print or replace worker ID cards with a reason; review recorded attendance, supporting face photos and employee rates; and create, adjust and export draft payroll.

Admin retains employee-account linking, pay-rate/costing-basis changes, payroll finalization/voiding, attendance corrections and staff account administration. Finance or Admin records payroll payment. HR cannot post stock, manage purchasing/billing, or read full project financial records. Project/site reference reads return safe names and identifiers, not project contracts or balances.

The database remains authoritative: hiding a button is not the permission boundary. Existing snapshots, idempotency, posted-history corrections and payroll locks remain intact. Department maintenance does not delete payroll history. HR is web-only; installed field mobile apps remain compatible.

## Tutorial recording order

Record short videos using one role at a time. Show the expected result at the end of each task.

1. **Everyone:** sign in, identify the current role, use search, open a record, close a panel, and recognize confirmation/error/loading states.
2. **Admin:** invite an employee into the correct role, assign project/warehouse/truck access, and explain which approvals remain Admin-only. Do not send test invitations to real staff while recording.
3. **HR:** find an employee; edit details from the list; open details and edit while keeping the record visible; set a department; assign a worker to a project/site; preview an ID card. Review attendance and supporting evidence, then prepare draft payroll. Show “Ask Admin to finalize,” not a payment action.
4. **Foreman and Engineer:** demonstrate request → independent approval → warehouse release → site receipt → actual use. Explain warehouse stock versus site stock using the resulting quantities.
5. **Warehouse / Bodegera:** show assigned warehouse stock, an approved request, release, supplier receiving and the resulting stock history. Do not imply approval alone deducts on-hand stock.
6. **Finance:** review costs, create/adjust draft payroll, then demonstrate payment only on an already finalized, disposable staging payroll. Admin separately demonstrates finalization.
7. **Driver:** My Truck → Add Expense → confirmation → My Expenses. Demonstrate the unassigned message and explain that Admin changes truck assignments.

For attendance, demonstrate worker QR → verify identity → fresh camera photo → review → save. A supporting photo is not automatic face recognition, and a scan alone does not post labour costs. Current attendance is project-assigned worker attendance; this update does not add a separate office clock-in workflow or worker self-service accounts. Payroll statutory deductions remain manual.

## Questions to ask staff

- Without help, where would you go to start your daily task?
- What do you expect this button to do?
- How do you know the change was saved?
- Does this record belong to the right employee, project, warehouse or truck?
- Which step requires another role, and who should handle it?
- Which label or amount is unclear?
- What would prevent you from using this during a busy workday?

## Verification and rollout

The first read-only audit checked 138 page/role combinations across the six existing roles and identified generic error handling on Admin-only URLs. The expanded audit checked all seven roles over 161 page requests with no generic server errors. It verified the HR home and management controls, denied finance/stock/account pages, and the existing role homes. Dedicated regression scripts additionally cover legacy URLs and reference-choice endpoints.

Local tests cover HR employee/contact/department/assignment/card management, payroll preparation/retry/locked state, safe project labels, denied Admin functions, Finance payment authority and disabled-account denial. The existing 42 real PostgreSQL workflow checks passed after the full HR migration chain. Unit tests, lint, TypeScript and production build are recorded in the final verification notes.

Staging SQL: `20261114100000_hr_role.sql`, then `20261114101000_hr_workforce_access.sql`. User confirmed applying the reviewed combined file `D:/Client-Project/output/nognog-hr-role-and-access-20261114.sql`; SHA-256 `8d16f50ece595b1cfd50c1d04f226db1dbd2d66b98fc513a3dc1ace00669a37e`. Authenticated staging HR checks confirmed narrow reads and financial/stock denials. A dedicated `hr@nognog.local` test account was created through account administration and the existing initial-role command, without sending email or changing existing roles. Business records were not modified by those read checks.

The role enum is committed before the access migration uses it, following [PostgreSQL enum transaction requirements](https://www.postgresql.org/docs/current/sql-altertype.html). Workforce reference functions use explicit role checks and an empty search path following [Supabase function guidance](https://supabase.com/docs/guides/database/functions).

Run `npm run test:hr-permissions` with the local PostgreSQL runtime configured. Run `npm run test:web-role-access` against a local production web build with the authorized test-account password in the environment. Never commit credentials or export employee details into the test log.

Staff acceptance and physical-phone camera testing remain necessary before company-wide daily use. Passing these checks does not certify every possible ERP/browser/device path as bug-free.

### Final refinements

Closed header menus no longer contribute off-screen scrollable content. The HR overview and notification menu were checked at phone width: page scroll width matched the available client width. Desktop and phone screenshots are saved in `D:/Client-Project/output/hr-role-verification-20261114/`.

Employee project filtering now uses the existing employee-assignment relationship in the database instead of loading every matching ID into a request URL. Lists sort by employee name and unique ID, recover stale page offsets, and normalize invalid page numbers. ID-card trades and project assignments are paginated as well. These read changes require no additional SQL.

The final role script includes employee editor/rate-control checks, payroll export and forbidden-button checks, printable worker cards, reference-choice permissions, project filtering and invalid/stale pagination. No real payment or stock posting was performed in the browser checks. The reviewed HR database test also verifies actual private-photo metadata and storage-row access through RLS, including denials for Finance, Engineer and Warehouse Staff.
Final checks: 194 automated tests; 226 authenticated read-only web checks across seven roles; isolated HR command/RLS/storage tests; 42 existing PostgreSQL workflow checks; TypeScript, lint, production build and 154 unique migrations passed. Remaining acceptance includes physical-phone camera/QR work and staff practice; this is not a zero-bug guarantee.
