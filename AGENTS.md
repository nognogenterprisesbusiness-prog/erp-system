# Codex repository instructions — Nognog Enterprises Construction ERP

## Mission

Build and maintain the agreed **web-first Construction ERP** described in [`README.md`](./README.md). The responsive web application is the only active client; keep shared domain/database contracts suitable for a future mobile client without adding Expo or React Native yet. The top-priority vertical slice is: **foreman requests material → authorized approval → warehouse dispatch → site receipt → foreman records actual consumption → per-project cost/report**. Equipment and labor flows must feed project costing without double-counting.

Read README sections 0–3, 5, 9, 15–17 before changes to inventory, roles, expenses or request flows. The README is a proposed scope/backlog; distinguish confirmed needs from decisions awaiting client sign-off. Never mark a checkbox `[x]` unless implemented **and tested**.

## Before every task

1. Inspect existing repository structure, package scripts, schema/migrations, permissions, tests and related screens. **Do not assume the README's proposed structure is already present.**
2. Summarize the task's end-user workflow, affected entities, approved decision(s), access roles and exact acceptance criteria.
3. If a key business rule is undecided (README D01–D18), implement only the uncontroversial layer, document the blocker, and ask for a product decision rather than inventing a policy.
4. Identify the smallest complete vertical slice and files to edit. Avoid broad rewrites or unrelated style changes.
5. Plan tests **before** a transaction-heavy change: concurrency, idempotency, permission denial and data reconciliation.

## Proposed technology

- TypeScript throughout: Next.js responsive web plus shared domain validation/types suitable for a later mobile client.
- Supabase PostgreSQL/Auth/Storage/Realtime; database migrations are the authoritative record for schema changes.
- Avoid choosing unsupported library versions or adding dependencies merely for convenience. Inspect existing versions and documentation before installation.
- Do not invent `npm`/`pnpm` scripts, database tables, environment variables or APIs: inspect the project and update documentation with actual commands.

## Non-negotiable domain invariants

1. **Stock on-hand is not approval or reservation.** Approval is authorization; reservation reduces *available*, not on-hand; dispatch decrements source; receipt increments destination; consumption decrements site.
2. One ledger movement with a durable unique identifier represents each posted material movement. If maintaining balance projections, update ledger + affected balances + request fulfillment in **one database transaction**.
3. Lock the relevant balance/reservation rows or use an equivalent concurrency-safe atomic command. No oversell/negative inventory under default policy.
4. Use idempotency keys for retries: dispatch, receipt, consumption, labor/equipment posting, payment collection and notifications where necessary.
5. Transfers preserve stock globally except explicitly recorded accepted loss/damage. Handle partial issue/receipt and in-transit state.
6. Material project cost derives from **posted consumption** under proposed D06, not material request, purchase, release or site receipt. Document if client selects another policy.
7. Store posted line-item **cost and rate snapshots**. A future supplier quote, material price, worker rate or asset rate change must not rewrite historical records.
8. Never post project cost twice from a daily report and its linked material/labor/equipment transaction. Prefer foreign-key links and once-only posting guarantees.
9. Posted records are corrected using approved reversal/compensation; preserve actors, timestamps, reasons and original references.
10. Materials (fungible stock), reusable tools, and equipment/vehicles have distinct accounting and custody lifecycles.
11. Use `numeric`/decimal for prices, costs and rates; establish quantity/UOM precision and currency/rounding policy. No JS float calculations as authoritative money posting.
12. Each cross-project/cross-location action validates permissions, ownership, quantity and status **server-side**; a QR code never bypasses authorization.

## Security and data handling

- Use Supabase Auth plus a role/capability/membership model. UI hides unauthorized actions, but RLS and server commands enforce authorization.
- Review table grants, policies, views, Storage policies and function `EXECUTE` permissions. Do not use a service-role key in client bundles.
- High-risk stock/finance changes go through trusted endpoints or tightly scoped Postgres functions; do not allow client-side balance writes.
- Default to the smallest data scope required by user/company/project/site. Deny by default; test negative access.
- Store secret credentials only in server environment/secret store. No production data in test fixtures, logs, screenshots or seed scripts.
- Personal information, invoices, photos and exports need permission checks and documented retention/backup policy.
- Never modify production schema or delete production data without explicit approval and safe migration/backup plan.

## Implementation approach

- Implement in README phase order where possible; prioritize Phase 3 over dashboard polish.
- Pair each migration with indexes, constraints, policy/grant review and realistic seed/test cases.
- Centralize domain commands and shared validation; do not duplicate stock mutation logic across screens or future clients.
- Prefer strongly typed domain state transitions; never accept arbitrary status strings from clients.
- Form handling must cover loading, errors, retries, no access, quantity limits and partial fulfillment.
- Keep sites/warehouses explicit; don't infer location from current user alone.
- Treat Realtime as UI refresh, not transaction confirmation or authoritative event storage.
- QR codes identify records; scan result still requires server lookup and permission check.
- Any offline-write support needs explicit client sign-off and idempotent conflict rules. Never imply it is supported merely because cached data displays offline.
- Respect chosen naming/style of the repository; don't overwrite unrelated user work.

## Verification before calling a task done

- Run the repository's actual formatter/linter/typecheck/test scripts where available. Report if missing or blocked.
- For stock changes, prove: two simultaneous releases, duplicate retry, partial issue, warehouse-to-site transfer, partial receipt, use, return, reversal and stock-card reconciliation.
- For costing changes, prove: price/rate changes affect future entries only; costs posted once; expense categories don't double count.
- For permissions, prove authorized **and** denied user roles, including cross-project, cross-warehouse, reports and export.
- Test the responsive web consumer and shared contracts; future native consumers require their own validation when that scope is approved.
- Provide a concise work summary: files changed, migrations, tests run/results, unresolved decisions, risks and the next small task.
- Update the corresponding README checkbox only with evidence; add a row to its progress log when completing a milestone.

## What not to do

- Do not silently decide inventory valuation, payroll logic, tax rules, approval hierarchy, offline behavior or billing model.
- Do not replace append-only posted histories with edit-in-place admin forms.
- Do not use optimistic UI updates as proof that a stock issue/payment committed.
- Do not hardcode roles in many components, trust client-supplied financial totals or accept QR-provided pricing.
- Do not treat quote amount, timeline or every checkbox as contractual acceptance.
- Do not promise app store approval, send messages, trigger paid resources or deploy live without authorization.

## Suggested Codex task template

```text
Read AGENTS.md and README.md. Implement [small named workflow] in the existing repository.
First inspect the repo and identify any unresolved README decisions affecting it.
Preserve all domain invariants and role/RLS boundaries.
Write/update necessary migrations, application code, and positive/negative tests.
Run actual available checks and report their results.
Update only the relevant README checkboxes after verifying completion.
Do not implement unrelated modules or invent unresolved business policies.
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
