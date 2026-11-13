# Operational synchronization — 2026-11-14

## What changes

The existing web refresh and mobile query invalidation paths now cover driver assignment/removal, asset expenses and reversals, attendance evidence, warehouse stock and dispatch. Reference pages do not gain a blanket subscription. No posting, costing, assignment, attendance or approval rule changed.

Web details reread authorized server data. A page listens only to relevant tables; assignment hints are filtered to the signed-in recipient. Event bursts use a fixed window with a minimum two-second gap between server refreshes. Visible, online operational views reconcile periodically, including when a healthy channel misses a permission loss. Unsaved forms and submissions defer background refresh. Field snapshots stay in memory, redact credential-like values and are cleared on successful save/unmount. Removing the last draft applies queued updates without closing the drawer. Existing form validation and idempotency remain authoritative.

Mobile subscriptions follow the actual account roles. Driver listens for own assignment hints and expense updates; Warehouse changes target the real warehouse query keys. Cache invalidation is scoped to the current account, refetches mounted queries, and retains cached content and local form state. Background/reconnect reconciliation catches missed updates. A stale assignment keeps an unconfirmed expense retry available for reconciliation; it cannot create a new expense for the wrong truck.

## Database rollout

`supabase/migrations/20261114090000_operational_realtime_gaps.sql` was applied in staging by the user and verified against the configured web/mobile database. The reviewed rollout file is `D:/Client-Project/output/nognog-operational-realtime-20261114.sql` (SHA-256 `70175e7648f41f3ed72eabcf15b3e01087dc2353a6a2d3866ddbee5e7020664c`). It adds RLS-checked publication sources `asset_expenses`, `asset_events`, `attendance_scans` and a bounded `live_refresh_signals` table.

Signals contain recipient, topic, revision and timestamp, never truck, receipt, face photo or financial details. Assignment insert/change/removal and vehicle metadata updates emit hints. The raw Admin-only assignment table is not published. Recipient/topic uniqueness keeps storage bounded; clients cannot insert, update or delete signals. Active-account and role checks govern reads. Supabase documents the [DELETE-event authorization limitation](https://supabase.com/docs/guides/realtime/postgres-changes), so deletion of a truck assignment is represented by a private signal instead of streaming the deleted assignment row. Receipt/face-photo tables and Storage permissions remain unchanged.

## Verification

- 190 web tests, 36 mobile tests, lint/types and production build passed; Android/iOS/web exports passed.
- Isolated PostgreSQL tests covered assignment add/change/remove, no-op suppression, vehicle edits, bounded storage, five-role/other-driver denial, revoked-account denial and required publication membership. The existing asset-expense suite passed with the full migration chain.
- Separate staging Admin/Driver sessions received removal and restoration events. Finance received zero driver signals and could not read them. The original QA truck was restored; assignment identity/timestamp changed normally.
- The open vehicle panel showed driver count 1 → 0 → 1 without manual refresh. No browser console errors were observed.
- An unchanged source-warehouse save emitted a real request event from another session. A local read-only tracing proxy observed zero background record reads while an approval note was dirty, one queued read after leaving the form, and a second live read for a subsequent event in read-only mode. The drawer stayed open. Request purpose, date, source and status stayed identical; no approval/stock/cost operation was posted. The two no-op source saves create normal audit/command-receipt metadata.
- Production mobile configuration uses the same database that was verified. Signed Android 35 contains the exact runtime files from mobile commit `49b9d79`, the production API URL, matching APK/AAB JavaScript and the existing upload certificate. No physical Android device was connected; no Play submission was performed.

Evidence: `D:/Client-Project/output/operational-realtime-20261114/`. Android files and verification: `D:/Client-Project/output/nognog-mobile/build-35/`.

## Re-running

- `npm run test:all`
- `ERP_TEST_PG_BIN` points to a local runtime; `npm run test:operational-realtime` creates and removes its own fictional database.
- `npm run test:live-assignment-sync` requires the authorized test-account password and explicit `ERP_TEST_ASSIGNMENT_CYCLE=1`; it refuses a truck without the QA code prefix and restores its original truck. Do not use an operational driver for this test.
- `scripts/test-live-request-refresh.mjs` requires explicit `ERP_TEST_NOOP_SOURCE=1` and a submitted request ID whose source is already assigned. It saves the same source through the existing authorized command, without approving/releasing anything.

Earlier installed mobile builds remain API-compatible. Release Android 35 for the new Driver/Warehouse synchronization behavior; there is no minimum-build or protocol change.
