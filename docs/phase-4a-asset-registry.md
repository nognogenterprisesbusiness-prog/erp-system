# Phase 4A — Equipment and vehicle registry

## Stage boundary

This stage implements the shared asset identity, configurable equipment categories and vehicle types, current operational status, current authorized location, equipment/vehicle subtype details, archival, web management, RLS, audit logging, and append-only registry history.

It does not implement requests, approvals, assignments, custody transfer/receipt, usage, rates, project costing, vehicle journeys, fuel, maintenance work orders, QR codes, or mobile asset mutations. Phase 4B must not begin until this stage's database suite and role walkthrough pass.

## Data model

- `assets` is the single physical-asset identity for both equipment and vehicles. Global asset codes prevent separate equipment and vehicle records from sharing a code.
- `equipment_details` and `vehicle_details` are exclusive one-to-one subtypes. Deferred database constraints require exactly one subtype matching `assets.asset_kind`.
- Equipment serial numbers and vehicle plate numbers are unique.
- `asset_categories` stores configurable equipment categories and vehicle types in PostgreSQL.
- `asset_locations` adapts existing Phase 2 `inventory_locations` for warehouses and project sites. It stores new records only for maintenance facilities and other authorized locations.
- `assets.status` is the authoritative availability state. Assignment-controlled `assigned` and `in_use` states exist in the type but cannot be set through the registry editor.
- `asset_events` is append-only and records registration, administrative updates, location/status changes, and archival.
- Equipment acquisition cost and vehicle mileage use PostgreSQL numeric types. Vehicle mileage cannot decrease.

Migration: `supabase/migrations/20260922120000_phase4a_asset_registry.sql`

## Authorization

- Super Admin, Owner, and Admin can create, edit, classify, relocate, and archive registry records.
- Assigned warehouse staff can read assets currently at their assigned warehouses.
- Assigned project members can read assets currently at their authorized project sites.
- Accounting can read the cross-location asset registry for reporting.
- Unassigned workers cannot read registry assets.
- Client code receives no direct insert, update, or delete grants for assets or history. Registry changes use validated security-definer commands and are re-authorized in server actions.

## Verification

Run against local development Supabase only:

```powershell
npm run supabase:start
npm run supabase:reset
```

The Phase 4A pgTAP suite was removed for demo-focused development. Recreate shared-identity, subtype, code/plate, classification, status, mileage, role-visibility, denied-mutation, and archival coverage before live release.

Application checks:

```powershell
npm run typecheck
npm run lint
npm run build
```

## Deferred decisions

- D08: QR identity and label format are not approved, so QR fields and workflows are omitted.
- D09: exclusive/shared allocation and overlap rules are required before assignments are implemented in Phase 4B.
- D10: rate types and cost inclusions are required before usage costing, fuel, or maintenance expenses are implemented in Phase 4C.
- D01: the approval hierarchy is required before equipment-request approval is implemented.
- Return inspection requirements must be approved before a returned asset automatically becomes available.
