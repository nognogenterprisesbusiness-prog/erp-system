# Phase 5A — Employee and workforce foundation

## Implemented boundary

Phase 5A implements the uncontroversial workforce foundation only:

- configurable employee categories;
- employee registry with archive/separation instead of deletion;
- optional one-to-one link to an existing active user profile;
- private contact storage separated from project-visible employee identity;
- project and site workforce assignment history;
- explicit assignment end and atomic transfer commands;
- employee-specific hourly and daily labor-rate versions with effective dates;
- employee and project workforce web views;
- append-only workforce events and database audit entries; and
- RLS/command tests for authorized and denied roles.

Phase 5B attendance entry, approval/correction, overtime, and Phase 5C labor-cost posting/reporting are not implemented. Any separate native client remains deferred.

## Data ownership and access

`employees` is the workforce identity. `profiles` remains the authenticated application identity. Linking the two is optional and does not grant project or site access. Application access still comes from the Phase 2 `project_assignments` model.

Contact numbers are stored in `employee_private_contacts`. Admin/owner/super-admin, accounting, and the linked employee can read that table. Project members can read the non-contact employee identity only when the employee has workforce history on a project they can access.

Labor rates are visible to admin/owner/super-admin, accounting, and the linked employee. Project workforce lists show rates only when the current user has the finance/workforce-rate capability.

All registry, assignment, transfer, archive, and rate changes use security-definer database commands that re-check roles. Authenticated clients have read-only table grants and cannot directly alter workforce history.

## Rules intentionally selected for Phase 5A

- Employee code is globally unique; a user profile can link to at most one employee.
- Workers without user accounts are first-class workforce records.
- Employment type remains validated text until the client approves a controlled list.
- Categories/trades are configurable reference data.
- Multiple concurrent projects are allowed, but the same employee cannot have two active assignments at the same project site.
- A transfer requires an explicit current end date and a later new start date. Both changes commit atomically.
- Employee archive is blocked while any workforce assignment is active.
- Rates are employee-specific and may be hourly or daily. A rate amount and start date are immutable after insertion; an open rate may only be closed with an end date.
- Effective periods for the same employee and rate type cannot overlap.
- Rate records do not yet select a payable rate or post project cost. That decision belongs to attendance/costing phases.

## Decisions still required before Phase 5B/5C

1. Approvers for attendance submission, correction, and backdating.
2. Whether workers can be assigned to overlapping projects on the same day and how time allocations prove no overlap (README D09).
3. Which rate basis applies to each attendance entry when hourly and daily rates coexist.
4. Whether project- or position-specific rates are required in addition to the employee rate.
5. Rules for overtime, half-day, absence, leave, holidays, allowances, travel, and piece-rate work.
6. Payroll/tax/statutory deduction scope; none is included in Phase 5A.
7. Attendance correction/reversal and final labor-cost posting policy.

## Verification

The Phase 5A pgTAP suite was removed for demo-focused development. Recreate schema/grant, account-link, assignment/transfer, rate-history, archival, and negative RLS coverage before live release.

Apply and test only against a disposable local/staging database:

```text
npm run supabase:start
npm run supabase:reset
```

The repository must not proceed to Phase 5B until the database suite and a role-by-role web walkthrough pass.
