# Audit follow-through — 19 October 2026

## Stuck reservation after a partial dispatch (fixed)

Approval reserves stock; only `cancel_material_request` released a reservation, and cancellation is refused after the first dispatch. A partly dispatched request whose remainder would never be sent therefore kept that stock reserved indefinitely, lowering available stock with no way to free it.

`20261019100000_close_request_remainder.sql` adds `public.close_request_remainder(idempotency_key, request_id, reason)`:

- Allowed for Admin, or Warehouse Staff actively assigned to the request's source warehouse (the same authority as dispatching). Foreman, Engineer, Finance and anonymous callers are denied.
- Requires an approved or partially approved request with at least one dispatch (otherwise use Cancel) and a reason of 3–500 characters.
- Releases only the undispatched reservation: `reserved_quantity` falls, `quantity_on_hand` is unchanged, and dispatched or received quantities are untouched. The released reservation can no longer be dispatched.
- Each release is a `released` reservation event carrying the actor, time and reason (new nullable `reason` column), shown in the request History.
- Replays with the same key return the same result; the same key with a different reason is refused; closing twice is refused.

Web: a "Close remaining quantity" form appears on the request page for Admin/Warehouse Staff when a dispatched request still has reserved stock. This is a policy choice (who may close) that follows dispatch authority; change it if the client wants Admin-only.

Regression: `npm run test:close-remainder`.

## Mobile retry keys (fixed)

The mobile request screen used one retry key for every action and replaced it only after a success, so a failed receipt for one delivery blocked a receipt for another. Keys are now kept per target (each delivery, the decision, the cancellation) and cleared only when that command succeeds, so a lost-reply retry is still recognised and different targets never share a key. Needs a new signed Android build to reach phones.

## Test drift (fixed)

`test:material-reservations` predated three intended rules: the private schema is not reachable by signed-in users, assigned Warehouse Staff see submitted requests for their warehouse, and a site return needs a reason. The test now asserts the current rules.
