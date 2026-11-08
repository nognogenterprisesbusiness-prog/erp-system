# QR worker ID attendance — 2026-11-08

The client asked for QR or face-based attendance. This adds **QR worker ID cards scanned by the assigned Foreman**. Face recognition is not included: it is biometric (sensitive) personal information under the Data Privacy Act, needs worker consent and a paid or on-device matching service, and the README lists biometric attendance as needing separate approval.

## Workflow

1. **Admin prints cards.** Every employee gets a card automatically (existing employees were backfilled by the migration). Go to Employees → **Print ID cards** (filtered by the selected project, if any) or an employee → **Worker ID card → Print card**. Cards are credit-card size, two per row on A4. Lost or damaged card: **Replace card** with a reason; the old card stops scanning immediately.
2. **Foreman scans.** In the mobile app, choose the project site → **Attendance** → **Scan ID Cards**. The first scan of the day is **time-in**, the next is **time-out**. The ERP uses its own clock (Asia/Manila), not the phone's. A card scanned again within five minutes counts once.
3. **Foreman records.** Each scanned worker joins the list. After time-out, hours are filled in as the time between the scans (breaks included) and the note reads, for example, `QR in 7:02 AM · out 5:10 PM`. The Foreman reviews hours and full/half day, then taps **Record Attendance**, the same posting as before.

Workers can still be added by hand (forgotten card); the note then shows no scan times.

## Rules enforced by the database (`20261108120000_qr_attendance_cards.sql`)

- Only the Foreman assigned to that project site (or Admin) can scan or view scans. Engineers, Warehouse and Finance cannot.
- The card must be the worker's **current** card and the worker must be **active and assigned to that site today**. Material/asset QR codes and replaced cards are refused.
- Scanning stops once attendance for that worker, project and day is recorded.
- Scans are **append-only** and **never post cost**. Labour cost is still posted once by `post_project_attendance_batch` with the rate snapshot, so payroll and project costs are unchanged.
- Card codes are random (`NW-` + 32 hex) and readable only by Admin; card issue and replacement are audited.

## Decisions still needed from the client

- **Paid hours from scans:** lunch/break deduction, rounding (e.g. to 30 minutes), late arrival and overtime. Today the Foreman edits hours before recording; nothing is deducted automatically.
- **Photo at time-in** (to stop someone scanning a friend's card): not built; it would need a privacy notice and retention period.
- **Who scans:** built for the Foreman's phone. A shared site phone at the gate would need its own account policy.

## Verification

`npm run test:qr-attendance` (isolated PostgreSQL): automatic cards and backfill, Admin-only read/replace with audit, Foreman-only scanning by site, refused replaced/foreign/unassigned cards, concurrent retries and double scans counted once, time-out hours, append-only scans, no cost from scans, one posting from scanned hours, and no scans after recording. Domain tests cover card recognition and the pre-filled attendance entry. Mobile typecheck, lint and tests pass.

**Not verified:** scanning printed cards with a real phone camera, printing on the client's printer, the hosted migration and authenticated browser use.

## Rollout

Apply `20261108120000_qr_attendance_cards.sql` on the hosted database after the earlier pending migrations (see [payroll and receipt types](payroll-receipt-types-charts-2026-11-08.md)), deploy the web app, then release a mobile build containing the scan panel. Older mobile builds keep working; they just have no scan button.
