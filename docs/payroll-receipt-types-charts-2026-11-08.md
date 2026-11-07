# Receipt cost types, simple payroll and chart fixes — 2026-11-08

## Receipt expenses: choose Labour, Equipment or Other

Site purchases → Receipt expense now has **Charge to**: Labour, Equipment or Other expenses (default). The engineer still picks the project site and amount; the project is taken from the site.

- `20261108100000_receipt_expense_cost_type.sql` adds the optional `p_cost_type` to `submit_site_receipt_expense` (default `other`, so installed mobile/API clients keep working). It posts through the same once-only `project_additional_expenses` entry with category `labor`, `equipment` or `other`. Above ₱50,000 the Admin approval still applies and keeps the chosen type.
- `get_project_management_summary` and `get_dashboard_monthly_project_costs` count tagged receipts under Labour/Equipment. Project totals are unchanged; each receipt still counts once and existing reversals remove it once.
- Labour receipts are separate from attendance. Don't record the same work both ways.

## Cost breakdown and charts

- Project cost breakdown: **Other expenses** is its own slice. Stock and transfer losses appear as **Stock losses** only when there are any (previously merged into "Other / losses").
- Donut shows the **total** in the centre; tapping a slice or row shows that category's amount and share and tapping again clears it. ₱0 categories are greyed and can't be selected (previously they dimmed the chart and showed 0.0%).
- Dashboard **Monthly expenses** and **Material consumption** are now stacked monthly bars with round axis steps (0, 2K, 4K…). The old smooth curves drew hills between months that had no activity. Month labels sit under their bars; tap a bar or month for exact values and a total. "Other / stock loss" is labelled **Other**.

## Simple payroll (`20261108110000_simple_payroll.sql`)

Workflow: **People → Payroll → New payroll** (period, pay date, all employees or one department) → enter **other earnings** (salary, allowance, overtime) and **deductions** (SSS, PhilHealth, Pag-IBIG, tax, advances) per employee → **Admin finalizes** → Admin/Finance **mark as paid** with date and reference. Export CSV from the payroll page.

- **Attendance pay** = posted, non-reversed project attendance cost in the period (already rate-snapshotted). Finalizing recalculates it and locks the lines.
- **Departments**: Admin adds them on the Payroll page and sets each employee's department on the employee page.
- One active payroll per employee per overlapping period (prevents double pay). Voiding (Admin, with reason) keeps history and frees the period for a corrected payroll.
- Payroll **never posts project costs**. Project labour cost already comes from attendance.
- Admin and Finance only, enforced by RLS and server functions. Site and warehouse roles cannot read payroll. All changes are audited.
- **Not automated (needs separate approval):** statutory SSS/PhilHealth/Pag-IBIG/withholding-tax computation, payslips, bank disbursement and accounting postings. Enter those amounts manually as deductions.

## Verification (local isolated PostgreSQL + web)

`npm run test:payroll` covers receipt types (Labour, Equipment, Other and the legacy default), retries and changed retries, the totals/dashboard split, reversal, >₱50k approval, departments, payroll from attendance, department scope, concurrent create/finalize, overlap guard, line validation, finalize recalculation after an attendance reversal, lock, paid once, no project-cost change, void, role denial, no direct writes and audit. Database regression suites, web unit tests (incl. chart geometry and payroll schemas), typecheck, lint and production build are listed in the commit. Charts were checked as static renders at desktop and 358px. **Not verified:** authenticated browser use against a real database, hosted migrations and phone acceptance.

## Rollout order

Apply on the hosted database, in order: `20261012160000_simple_mobile_equipment_requests.sql` (still missing there), `20261108090200_asset_expense_hardening.sql`, `20261108100000_receipt_expense_cost_type.sql`, `20261108110000_simple_payroll.sql`. Then deploy the web app. Deploying before `20261108100000` would break receipt-expense submission, because the web sends the new `p_cost_type` argument.
