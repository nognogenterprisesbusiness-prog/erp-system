# Mobile vehicle history and nonblocking startup

The mobile Home UI renders while compatibility metadata loads in the background. The blocking “Checking app version” page is removed. A confirmed unsupported protocol/build still shows the required-update screen, and protected API calls retain HTTP 426 enforcement. Network failures alone do not force an update.

Apply `supabase/migrations/20261013090000_mobile_vehicle_history.sql` after existing migrations and deploy the matching API before distributing Android build 17. This read-only migration adds `list_mobile_vehicle_history` and location-history indexes; it does not change stock, costs or existing mobile endpoints. Web changes remain local on main until explicitly released.

Mobile Home → Vehicle History shows the selected site's vehicle registry movements, requests, handovers/returns, operating hours/corrections, linked material deliveries and diesel receipts. Search a vehicle/code/reference, then tap an entry to filter to that vehicle. Site Inventory vehicle rows open the filtered history. Past records remain visible after the vehicle leaves the site. Diesel entries link to the permitted Engineer purchase view. Historical external transport without a registered vehicle ID is not invented as a vehicle association.

The database enforces project/site access before returning records. Events are limited to the selected site, including a movement entering/leaving it; other locations are labelled generically. No rates, cost totals, receipt amounts or private event payloads are returned by this operational endpoint. Existing role-restricted finance screens retain amounts.

Site inventory continues to show positive available material stock and equipment/vehicles located at the site. Material requests show the active catalog, including zero stock, with availability across linked warehouses. Equipment requests show only available assets at the site or linked warehouses; reserved, checked-out and unrelated assets remain unavailable. Requests inherit Home project/site; source warehouse assignment remains a web operation.

Verification: mobile typecheck/lint, 25 mobile tests and Android/iOS exports; web typecheck/lint, 113 domain/web tests, 42 isolated PostgreSQL workflow checks and production build passed. The vehicle-fuel database suite additionally tests the combined timeline, delivery quantities, price-free output, pagination/search, anonymous/cross-site denial and access after relocation. The ten stock-simplification checks pass after correcting the retired Admin-only stock-in test expectation.

No production migration, web deployment, store submission or minimum-version change was performed. Actual-phone installation, cold launch, required-update behaviour and staff walkthrough remain release acceptance checks.
