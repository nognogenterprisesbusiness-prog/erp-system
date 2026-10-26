# Current site stock and request delivery visibility

The request/dispatch/receipt/consumption commands already implement the stock lifecycle. The missing UI context was the current site balance in request details and the delivery stage in mobile's request list.

## Changes

- Web request details add Site stock now and available quantity, separate from Requested/Approved/Reserved/Dispatched/Received/In transit. A delivery-stage banner and per-delivery badges distinguish reserved stock from stock actually on the way. Current site stock includes other receipts and use; Received remains specific to the request.
- Mobile request details show the named project/site and each requested material's current on-hand/available quantities. Request list badges show Ready for dispatch, Upcoming delivery, Partly received, Received or Completed with variance. Receipt entry remains inside each delivery. Home's Receive Deliveries screen links to Requests and labels its separate direct warehouse-transfer list.
- Remote transfers/receipts refresh the mobile request list and details; balance changes and local consumption refresh detail balances. No optimistic stock additions or new mutation commands are introduced.
- The shared contract fields are optional, so existing installed clients can ignore additive responses and the updated client can parse an older compatible response. The old vendored archive is replaced with the current quantity-only contract.

## Rollout

Apply `supabase/migrations/20261026100000_request_delivery_tracking.sql` after the existing migration chain, before deploying the paired web/API code. It adds one bounded, authenticated read function. No balances, reservations, valuation layers or posting rules change. Stock is visible only to callers with independent site access; warehouse-only access to a request does not grant the site's stock balance. Unavailable/forbidden request IDs return no rows. No prices are returned.

Install a newly built mobile release to obtain the new UI; an already installed build does not inherit source changes. This change does not set a forced-update policy or submit a store release. Native exports are verification artifacts, not signed installable builds.

Release follow-through: production Android build 27 was subsequently built locally from mobile `6fb2c25`, paired with web/API `c191786`. Signed APK/AAB files, certificate/package/version/architecture checks and release metadata are in `D:/Client-Project/output/nognog-mobile/build-27/`. The user confirmed migration installation. The updated request page loaded against the migrated database in a read-only browser check, showing upcoming deliveries separately from current site stock. Annotated client-guide screenshots and their original captures are in `D:/Client-Project/output/nognog-client-update-20261026/`. No receipt or other stock transaction was posted while preparing the guides. Physical-device acceptance remains open.

## Verification

Database regression follows request-only assignment through reservation, concurrent dispatch retry, partial acceptance and consumption, checking the tracking values at each step. It checks anonymous denial, restricted warehouse-only site stock, Finance/no-request scope, revoked site access and unchanged permanent memberships. Unit tests cover fractional quantities, mixed units, variance closure and optional API fields with price stripping. The existing 42 five-role ERP workflow suite passes. Browser/device visual acceptance remains separate from these tests; no hosted migration or business record was written by the implementation.
