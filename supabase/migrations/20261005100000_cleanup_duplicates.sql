-- Remove duplicate data entry:
-- 1. Engineers and Foremen are now set only on each project site. A
--    project-wide Personnel assignment that repeats the person's role on every
--    active site of that project is ended. History is kept (status inactive).
--    Assignments that still add access (the person is not on every site) are
--    left active.
-- 2. Names must be unique (ignoring case and extra spaces) for active
--    suppliers, materials of the same unit and warehouses, so the same
--    hardware store or item cannot be entered twice.
--
-- Safe to rerun: the update only touches active duplicates; indexes use IF NOT EXISTS.

update public.project_assignments a
set status = 'inactive', ended_at = now(), ended_by = a.assigned_by, updated_at = now()
where a.status = 'active'
  and a.assignment_role::text in ('engineer', 'foreman')
  and exists (select 1 from public.project_sites s where s.project_id = a.project_id and s.status = 'active')
  and not exists (
    select 1 from public.project_sites s
    where s.project_id = a.project_id and s.status = 'active'
      and not ((a.assignment_role::text = 'engineer' and s.engineer_id = a.user_id)
        or (a.assignment_role::text = 'foreman' and s.foreman_id = a.user_id))
  );

create unique index if not exists suppliers_name_unique
  on public.suppliers (lower(regexp_replace(trim(supplier_name), '\s+', ' ', 'g'))) where archived_at is null;
create unique index if not exists materials_name_unit_unique
  on public.materials (lower(regexp_replace(trim(name), '\s+', ' ', 'g')), base_unit_id) where archived_at is null;
create unique index if not exists warehouses_name_unique
  on public.warehouses (lower(regexp_replace(trim(name), '\s+', ' ', 'g')));
