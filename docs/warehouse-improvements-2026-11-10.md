# Warehouse request and mobile improvements

## Current flow

1. Engineer/Foreman requests materials for a project/site. Requesting does not change stock.
2. Admin reviews each material and chooses quantities from one or more active warehouses. A default warehouse remains an optional shortcut. Choosing a source for a request never permanently links that warehouse to the project.
3. Approval reserves the chosen quantities at their actual warehouses. Every source must have enough available stock. Reductions/rejections require a decision reason.
4. Each authorized warehouse operator releases only their allocated quantity, with delivery reference, transport and driver. Release deducts warehouse stock and creates the existing transfer/posting records once.
5. The site confirms receipt through the existing flow. Site stock changes at receipt. Project cost posting, valuation and approved variance rules remain in their existing ledger functions.

The request table keeps the essential quantities visible. Each material's View dialog contains detailed stock/delivery information. Allocation details identify the actual sources rather than presenting a combined balance as one warehouse's stock.

## Bodegera mobile

Warehouse home offers Receive supplier delivery and Release materials below the assigned warehouse. Receiving records delivered and usable quantities; rejected deliveries add no stock. Existing accepted inspections can be received without repeating inspection. Release lists contain only approved allocations at the selected assigned warehouse. Company truck choices are searchable and paginated; external transport remains supported. Both forms use the Philippine date automatically, show units and warehouse context, retain a failed submission's retry key, and prevent navigation while saving.

The dedicated authenticated mobile endpoint exposes no purchase prices and rejects unrelated site commands from Warehouse accounts. Role checks, active assignments, validation and stock locks also run on the server/database. No client amount can override purchase valuation. Foreman/Engineer forms show their selected project/site; material request choices show units. Delivery labels agree across web/mobile.

## Database rollout

Apply migrations in order:

- `20261110120000_request_warehouse_allocations.sql`
- `20261110120100_native_warehouse_operations.sql`

The combined review file is `D:/Client-Project/output/nognog-multi-warehouse-native-20261110.sql`. The user confirmed applying it to staging. Authenticated hosted calls verified the new stock-source, allocation and receiving functions. The local web/API was tested against that database before the replacement Android build.

Existing reservations are backfilled to dispatch allocations. Legacy single-warehouse commands remain compatible; ambiguous releases of multi-warehouse lines must use an explicit allocation. Cancellation releases all source reservations; closing a remainder requires permission for all remaining sources. Private posting helpers remain inaccessible directly to authenticated clients.

## Verification

- Web: 139 unit/domain tests, TypeScript and ESLint passed.
- Mobile: 25 tests, TypeScript and ESLint passed.
- New isolated PostgreSQL suites cover multi-source approval/release, concurrent retry deduplication, source-scoped access, receipt reconciliation, closure and atomic inspection/receiving rollback.
- Existing ERP workflow, reservations, concurrency, request assignments, remainder closure, mobile warehouse access, project costs, shortage planning, stock simplification and mobile integration suites passed with the new schema.
- Browser: actual no-default approval from Borbon 6 + Quoit 4 succeeded; excess allocation was blocked; both sources appeared separately for release. Native web preview verified warehouse-scoped queues, company truck choice, over-release validation, receiving validation and an existing accepted inspection.
- Temporary staging requests MR-00000027 and MR-00000028 were cancelled after review. No test dispatch or supplier receipt was posted to staging.

Screenshots and the API verification record are in `D:/Client-Project/output/warehouse-improvements-20261110`. Browser checks use React Native Web, not a physical phone. Physical-device acceptance and Play Store submission remain separate release steps.
