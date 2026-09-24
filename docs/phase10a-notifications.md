# Phase 10A — Notification infrastructure

## Scope and event contract

Migration `supabase/migrations/20260923130000_phase10a_notifications.sql` defines notification types, a durable outbox, recipient notifications, and append-only read events. Domain types and query validation live in `packages/domain/src/notifications.ts`. The responsive web center is `/notifications`; it reads real rows only.

Authoritative database commands may call `private.enqueue_notification_event` **inside the same transaction as the successful business event**. The event key must be stable for retries (for example, a source event UUID plus transition name). The command accepts a fixed category, sanitized title and message, related entity/project/warehouse identifiers, priority, and explicit recipient roles or user IDs. Client roles cannot call it. Reusing an event key with different content is rejected.

`private.process_notification_outbox` selects due events with `FOR UPDATE SKIP LOCKED`, resolves active users against current role and project/warehouse assignments, writes one notification per recipient, and records success or bounded retry/failure. A failure does not delete the source event. Supabase Cron schedules processing once per minute. The outbox is a delivery queue, not a second business ledger; no material, asset, labor, or financial record is created by it.

Phase 10A intentionally does **not** call the enqueuer from business workflows. Those hooks require the Phase 10B event contracts and the still-open approval/alert policies. No production messages or mock notification rows are seeded. Expo/native push, user preferences, low-stock rules, scheduled reminders, and admin notification settings are later stages.

## Authorization and delivery

- RLS and read commands require the recipient's current identity, active profile, project/warehouse scope, and additional sensitive-category role where applicable. Deep links open existing protected routes and re-check access.
- Clients cannot insert or update notification rows directly. Read transitions are database commands that append audit rows.
- Realtime publishes recipient notifications and the browser subscribes with a recipient filter. The browser reloads from PostgreSQL after subscription, reconnect, visibility changes, and periodic fallback. Missed socket events do not lose durable messages.
- The scheduled job's run history is in Supabase Cron; per-event attempts and final errors are in the protected outbox. Provider/mobile push receipts do not exist in this web-first stage.

## Verification gate

Run against a disposable local/staging Supabase instance:

```powershell
npm run typecheck
npm run lint
npm run build
npm run supabase:start
npm run supabase:reset
```

The Phase 10A pgTAP suite covers creation, scoped role recipients, idempotency, retries, counts, read actions, cross-user denial, and Realtime publication. After database tests pass, walk through the notification bell and list at narrow and desktop widths with manager/engineer/worker accounts, verify missed-message refresh after disconnect, and check Cron execution. Do not start Phase 10B until that gate passes.
