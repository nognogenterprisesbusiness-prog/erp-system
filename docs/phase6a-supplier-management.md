# Phase 6A — Supplier management foundation

These are historical phase notes. Supplier category management was retired on 2026-10-09; supplier purchasing, quotations and receipts have since been implemented. See [current simplification and rollout notes](simple-supplier-and-vehicle-setup.md).

## Implemented boundary

Phase 6A implements the supplier foundation required by later procurement stages:

- configurable supplier categories;
- supplier identity, business/contact details, status, payment terms, and archive history;
- many-to-many supplier/material catalogs reusing the Phase 3 material master and base units;
- supplier-specific material code, minimum order quantity, lead time, and availability;
- immutable price versions with effective dates, currency, recorded-by identity, and controlled closing;
- current/previous price and difference presentation;
- compatible-unit supplier comparison and complete price history;
- responsive web routes for list, filter, create, detail, edit, categories, and price comparison; and
- RLS, protected commands, audit records, and append-only supplier events.

Purchase requests, quotations, purchase orders, approvals, receiving, landed cost, payable posting, supplier scoring, and purchase history are not implemented. The supplier detail page therefore presents a truthful empty purchase-history state instead of mock transactions. Phase 6B must not begin until Phase 6A database and role verification passes.

## Data and lifecycle rules

- Supplier codes are globally unique and normalized to uppercase. Non-empty tax identification numbers are unique.
- Categories are database-backed reference data and cannot be archived while an active supplier uses them.
- A supplier cannot be archived until all active catalog entries are archived.
- Catalog entries reference the existing `materials` and `units_of_measure` tables. Phase 6A accepts only the material base unit, avoiding an unapproved conversion policy and making comparisons explicit.
- A supplier can carry many materials and a material can be offered by many suppliers. The active supplier/material/unit relationship and supplier material code are unique.
- Price amounts use PostgreSQL `numeric(18,2)`. Versions for one catalog entry cannot overlap.
- Price amount, start date, currency, supplier, material, and unit are immutable after insertion. An open version may only be closed with an end date.
- Comparison is informational and never selects, ranks, approves, or purchases from a supplier automatically.
- Currency is shown with each price. Cross-currency normalization is not attempted without an approved exchange-rate source and accounting policy.

## Authorization

Super Admin, Owner, and Admin can manage supplier reference data, suppliers, catalogs, and price versions. Accounting has read access to all supplier and price records. Other current roles have no supplier visibility because the repository does not yet define an approved procurement role or project-scoped commercial policy.

The responsive UI mirrors these capabilities for usability, while database grants, RLS, and role-checked security-definer commands remain authoritative. Authenticated clients cannot directly insert, update, or delete supplier tables or history.

## Web-first architecture

The only active client is the responsive Next.js application. Domain validation remains in `packages/domain` so the contracts are portable if a native client is approved later. No Expo, React Native, native navigation, or native-only package is included.

## Verification

Application verification:

```powershell
npm run typecheck
npm run lint
npm run build
```

Database verification must run against a disposable local or staging Supabase instance:

```powershell
npm run supabase:start
npm run supabase:reset
```

The Phase 6A pgTAP suite was removed for demo-focused development. Before live release, recreate coverage for protected grants, unique identities, configurable categories, many-to-many catalogs, base-unit enforcement, price history/current/previous retrieval, overlap rejection, archive rules, audit events, accounting read access, and denied mutations/reads for unauthorized roles.

The repository must not proceed to Phase 6B until the pgTAP suite and a role-by-role responsive-web walkthrough pass.
