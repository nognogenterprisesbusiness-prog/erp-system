# Phase 2 database

Phase 2 adds projects, project assignments, warehouses, warehouse assignments, project sites, project-to-warehouse authorization, and inventory-location identities. UUID primary keys, foreign keys, partial unique indexes, date checks, `numeric(18,2)` money columns, audit triggers, and RLS policies are defined in ordered Supabase migrations.

## Migration order

1. `20260922090000_phase1_auth_foundation.sql` creates profiles, roles, audit logging, and authentication hooks.
2. `20260922100000_phase2_projects_warehouses.sql` creates the Phase 2 operational model and policies.

Projects are archived through `public.archive_project(uuid)`. API roles have no `DELETE` grant on projects. Assignment removal changes an assignment to `inactive` and records its end actor/time. Changing a project manager synchronizes the active project-manager assignment while retaining the previous record.

`inventory_locations` deliberately identifies either one warehouse or one project site. It does not store quantities or movements; those belong to Phase 3 after the inventory rules are approved.

## Local validation

Docker Desktop (or another Docker engine supported by the Supabase CLI) must be running.

```bash
npm run supabase:start
npm run supabase:reset
```

`supabase/seed.sql` contains development-only identities and operational fixtures. Never load it into production.

## Deferred rules

- Project assignment roles provide scope; application roles provide organization-level capability. Administrators may grant scoped assignments, but clients cannot grant themselves roles.
- Accounting and warehouse staff receive project access only through an explicit project assignment. Merely linking a warehouse to a project does not disclose the project to every warehouse assignee.
- Warehouse deactivation is a status change, not deletion.
- Financial totals beyond the stored contract amount and initial budget are intentionally absent until the ledger and costing rules are approved.
