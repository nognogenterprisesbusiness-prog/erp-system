# Phase 7A — Daily project reports

## Implemented workflow

An administrator or an actively assigned project manager, engineer, or foreman selects an accessible project and active site in the responsive web application. The reporter can save an incomplete draft, resume editing their own draft, and submit it when work and accomplishments are recorded. The database generates a unique report number. Reports can be searched and filtered by project, site, date, and status. Each project has a report history page.

The reporter can create more than one report for the same project, site, and date. The report date is a PostgreSQL `date` and the web default is calculated in `Asia/Manila`; event timestamps are `timestamptz`. Draft edits and submissions create append-only events with full report snapshots and actors.

## Authorization and state

- Admin, Owner, and Super Admin can prepare and view reports across projects.
- An active project assignment as Project Manager, Engineer, or Foreman, together with a matching reporting role, permits viewing and preparing that project's reports.
- Only the original preparer can edit their draft. Project and preparer identity cannot change after creation.
- A submitted report cannot be edited through Phase 7A. A repeated submission with the same report UUID returns the original report without adding events.
- The only active transition is `draft → submitted`. Other statuses are represented in the schema for the later approved review workflow; no review or correction transition has been invented.
- Tables have read-only authenticated grants with project-scoped RLS. All writes use the role-checked `save_daily_report` database command. The server action validates form values again.

## Stage boundary

The current database has material movements and reference labor rates, but no posted material consumption costing, attendance/time entries, equipment or vehicle usage, project expense ledger, or approved daily report review policy. Phase 7A therefore records descriptive site reports only. It does not create those missing transactions or display illustrative costs as production figures. Site photos, approvals, progress percentages, milestones, and PDF export belong to later Phase 7 stages after their predecessors are verified and the relevant rules are approved.

The earlier web-first decision governs the mobile requirement: the same report form works on narrow browser viewports; there is no React Native or Expo client in this repository.

## Verification

Migration: `supabase/migrations/20260923110000_phase7a_daily_reports.sql`.
Database regression suite was removed for demo-focused development and must be recreated before live release.

```powershell
npm run typecheck
npm run lint
npm run build
npm run supabase:start
npm run supabase:reset
```

Run the database commands only against a disposable local or staging Supabase instance. The tests cover permissions, project/site matching, multiple reports per date, required fields on submission, draft revision snapshots, idempotent submission, immutable submitted reports, and unchanged inventory/labor/asset record counts. Complete a role-based responsive web walkthrough before beginning Phase 7B.
