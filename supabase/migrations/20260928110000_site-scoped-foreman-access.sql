-- Site assignments grant narrowly-scoped operational access even when no
-- project-wide project_assignments row exists for the assigned foreman.
create or replace function private.can_access_project_site(p_project_id uuid, p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or exists (
    select 1
    from public.project_sites ps
    join public.profiles profile on profile.id = auth.uid() and profile.is_active
    join public.user_roles role on role.user_id = profile.id
    where ps.id = p_site_id and ps.project_id = p_project_id and ps.status = 'active'
      and ((ps.foreman_id = auth.uid() and role.role = 'foreman')
        or (ps.engineer_id = auth.uid() and role.role = 'engineer'))
  ) or exists (
    select 1
    from public.project_assignments assignment
    join public.profiles profile on profile.id = assignment.user_id and profile.is_active
    join public.user_roles role on role.user_id = assignment.user_id
      and role.role::text = assignment.assignment_role::text
    where assignment.project_id = p_project_id and assignment.user_id = auth.uid()
      and assignment.status = 'active' and assignment.assignment_role in ('engineer','foreman')
  );
$$;

create or replace function private.can_access_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or exists (
    select 1 from public.project_assignments assignment
    join public.profiles profile on profile.id = assignment.user_id and profile.is_active
    where assignment.project_id = target_project_id
      and assignment.user_id = auth.uid() and assignment.status = 'active'
  );
$$;

create or replace function private.can_view_assigned_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_access_project(p_project_id) or exists (
    select 1 from public.project_sites site
    join public.profiles profile on profile.id = auth.uid() and profile.is_active
    join public.user_roles role on role.user_id = profile.id
    where site.project_id = p_project_id and site.status = 'active'
      and ((site.foreman_id = auth.uid() and role.role = 'foreman')
        or (site.engineer_id = auth.uid() and role.role = 'engineer'))
  );
$$;

revoke all on function private.can_access_project_site(uuid,uuid), private.can_access_project(uuid), private.can_view_assigned_project(uuid) from public, anon;
grant execute on function private.can_access_project_site(uuid,uuid), private.can_access_project(uuid), private.can_view_assigned_project(uuid) to authenticated;

drop policy if exists projects_select_authorized on public.projects;
create policy projects_select_authorized on public.projects for select to authenticated
using ((select auth.uid()) is not null and private.can_view_assigned_project(id));

drop policy if exists project_warehouses_select_authorized on public.project_warehouses;
create policy project_warehouses_select_authorized on public.project_warehouses for select to authenticated
using (private.can_view_assigned_project(project_id) or private.can_access_warehouse(warehouse_id));

drop policy if exists inventory_locations_select_authorized on public.inventory_locations;
create policy inventory_locations_select_authorized on public.inventory_locations for select to authenticated using (
  (warehouse_id is not null and private.can_access_warehouse(warehouse_id))
  or (project_site_id is not null and exists (select 1 from public.project_sites site
    where site.id = project_site_id and private.can_access_project_site(site.project_id,site.id)))
);

create or replace function private.can_view_inventory_location(target_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_inventory() or exists (
    select 1 from public.inventory_locations location
    where location.id = target_location_id and (
      (location.warehouse_id is not null and private.can_access_warehouse(location.warehouse_id))
      or (location.project_site_id is not null and exists (select 1 from public.project_sites site
        where site.id = location.project_site_id and private.can_access_project_site(site.project_id,site.id)))
    )
  );
$$;

create or replace function private.can_view_employee(target_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_view_workforce_financials()
    or exists (select 1 from public.employees employee
      where employee.id = target_employee_id and employee.profile_id = auth.uid())
    or exists (select 1 from public.employee_project_assignments assignment
      where assignment.employee_id = target_employee_id
        and private.can_access_project_site(assignment.project_id,assignment.project_site_id));
$$;

drop policy if exists project_sites_select_authorized on public.project_sites;
create policy project_sites_select_authorized on public.project_sites for select to authenticated
using (private.can_access_project_site(project_id, id));

drop policy if exists employee_project_assignments_select_authorized on public.employee_project_assignments;
create policy employee_project_assignments_select_authorized on public.employee_project_assignments for select to authenticated using (
  private.can_view_workforce_financials()
  or private.can_access_project_site(project_id, project_site_id)
  or exists (select 1 from public.employees e where e.id = employee_id and e.profile_id = (select auth.uid()))
);

create or replace function private.can_record_project_attendance(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or exists (
    select 1
    from public.project_sites site
    join public.profiles profile on profile.id = auth.uid() and profile.is_active
    join public.user_roles role on role.user_id = profile.id and role.role = 'foreman'
    where site.project_id = p_project_id and site.status = 'active' and site.foreman_id = auth.uid()
  ) or exists (
    select 1 from public.project_assignments assignment
    where assignment.project_id = p_project_id and assignment.user_id = auth.uid()
      and assignment.assignment_role = 'foreman' and assignment.status = 'active'
  );
$$;
revoke all on function private.can_record_project_attendance(uuid) from public, anon;
grant execute on function private.can_record_project_attendance(uuid) to authenticated;

create or replace function private.can_view_project_attendance(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects()
    or (private.has_any_role(array['engineer','foreman']::public.app_role[])
      and private.can_view_assigned_project(p_project_id));
$$;
revoke all on function private.can_view_project_attendance(uuid) from public, anon;
grant execute on function private.can_view_project_attendance(uuid) to authenticated;

-- A project-wide attendance RPC must still honor the foreman's assigned site.
create or replace function private.enforce_attendance_site_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_access_project_site(new.project_id, new.project_site_id) then
    raise exception 'not authorized for this project site' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_attendance_site_scope() from public, anon, authenticated;
drop trigger if exists project_attendance_site_scope on public.project_attendance;
create trigger project_attendance_site_scope before insert on public.project_attendance
for each row execute function private.enforce_attendance_site_scope();

create or replace function public.get_project_attendance_operations(p_project_id uuid, p_offset integer default 0, p_limit integer default 20)
returns table(id uuid,employee_id uuid,assignment_id uuid,project_id uuid,project_site_id uuid,
  work_date date,attendance_status text,hours_worked numeric,note text,created_at timestamptz,
  reversed boolean,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_view_project_attendance(p_project_id) then
    raise exception 'Not authorized for attendance' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 then raise exception 'Invalid pagination'; end if;
  return query select a.id,a.employee_id,a.assignment_id,a.project_id,a.project_site_id,a.work_date,
    a.attendance_status,a.hours_worked,a.note,a.created_at,
    exists(select 1 from public.project_attendance_reversals r where r.attendance_id=a.id),count(*) over()
  from public.project_attendance a where a.project_id=p_project_id
    and private.can_access_project_site(a.project_id,a.project_site_id)
  order by a.work_date desc,a.id desc offset p_offset limit p_limit;
end;
$$;
revoke all on function public.get_project_attendance_operations(uuid,integer,integer) from public, anon;
grant execute on function public.get_project_attendance_operations(uuid,integer,integer) to authenticated;

-- Request access is checked against the selected site, not merely project membership.
create or replace function private.can_view_material_request_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or
    (private.has_any_role(array['engineer','foreman']::public.app_role[]) and private.can_view_assigned_project(p_project_id));
$$;

create or replace function private.can_view_material_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.material_requests request
    where request.id = p_request_id
      and (private.can_access_project_site(request.project_id,request.project_site_id)
        or (request.status in ('approved','partially_approved')
          and private.has_any_role(array['warehouse_staff']::public.app_role[])
          and private.can_access_warehouse(request.source_warehouse_id))));
$$;

create or replace function public.get_requestable_warehouses()
returns table(project_id uuid, warehouse_id uuid, code text, name text)
language sql stable security definer set search_path = '' as $$
  select pw.project_id, w.id, w.code, w.name
  from public.project_warehouses pw
  join public.warehouses w on w.id = pw.warehouse_id and w.status = 'active'
  join public.projects p on p.id = pw.project_id and p.status = 'active' and p.archived_at is null
  where private.can_manage_projects()
    or (private.has_any_role(array['engineer','foreman']::public.app_role[]) and private.can_view_assigned_project(pw.project_id));
$$;
revoke all on function public.get_requestable_warehouses() from public, anon;
grant execute on function public.get_requestable_warehouses() to authenticated;

create or replace function private.enforce_material_request_submitter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.requested_by is distinct from auth.uid()
     or private.has_any_role(array['admin']::public.app_role[])
     or not private.has_any_role(array['engineer','foreman']::public.app_role[])
     or not private.can_access_project_site(new.project_id,new.project_site_id) then
    raise exception 'only staff assigned to this project site can submit material requests' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.can_view_daily_project_report(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or
    (private.has_any_role(array['engineer','foreman']::public.app_role[]) and private.can_view_assigned_project(p_project_id));
$$;

drop policy if exists daily_reports_select_authorized on public.daily_reports;
create policy daily_reports_select_authorized on public.daily_reports for select to authenticated
using (private.can_access_project_site(project_id,project_site_id));
drop policy if exists daily_report_events_select_authorized on public.daily_report_events;
create policy daily_report_events_select_authorized on public.daily_report_events for select to authenticated
using (exists (select 1 from public.daily_reports report where report.id = report_id
  and private.can_access_project_site(report.project_id,report.project_site_id)));

create or replace function private.enforce_daily_report_site_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_access_project_site(new.project_id,new.project_site_id) then
    raise exception 'not authorized for this project site' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_daily_report_site_scope() from public, anon, authenticated;
drop trigger if exists daily_report_site_scope on public.daily_reports;
create trigger daily_report_site_scope before insert or update of project_id,project_site_id on public.daily_reports
for each row execute function private.enforce_daily_report_site_scope();

-- Project pages expose site-bound progress and material-plan rows only for sites
-- the current staff member can see.
drop policy if exists project_progress_read on public.project_progress_entries;
create policy project_progress_read on public.project_progress_entries for select to authenticated
using (private.can_access_project_site(project_id,project_site_id));

create or replace function public.get_project_material_plan(p_project_id uuid)
returns table(id uuid, project_site_id uuid, site_name text, warehouse_id uuid, warehouse_name text,
  material_id uuid, material_code text, material_name text, unit_symbol text,
  planned_quantity numeric, required_on date, note text, consumed_quantity numeric,
  site_on_hand numeric, warehouse_available numeric, outstanding_request_quantity numeric,
  quantity_to_request numeric, procurement_shortage numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_view_daily_project_report(p_project_id) then
    raise exception 'Not authorized for this project' using errcode = '42501';
  end if;
  return query
  with facts as (
    select line.*, site.name as site_label, warehouse.name as warehouse_label, material.code as sku,
      material.name as material_label, unit.symbol as unit_label,
      coalesce((select sum(tx.quantity) from public.inventory_transactions tx
        join public.inventory_locations location on location.id = tx.source_location_id
        where tx.project_id = line.project_id and location.project_site_id = line.project_site_id
          and tx.material_id = line.material_id and tx.transaction_type = 'MATERIAL_CONSUMPTION'
          and not exists(select 1 from public.inventory_transactions reversal where reversal.reversal_of = tx.id)),0) as used_qty,
      coalesce((select balance.quantity_on_hand from public.inventory_balances balance
        join public.inventory_locations location on location.id = balance.inventory_location_id
        where location.project_site_id = line.project_site_id and balance.material_id = line.material_id),0) as at_site,
      coalesce((select balance.available_quantity from public.inventory_balances balance
        join public.inventory_locations location on location.id = balance.inventory_location_id
        where location.warehouse_id = line.warehouse_id and balance.material_id = line.material_id),0) as at_warehouse,
      coalesce((select sum(greatest(
        case when request.status = 'submitted' then request_line.requested_quantity else request_line.approved_quantity end
        - coalesce((select sum(item.received_quantity + item.variance_quantity)
          from public.material_request_dispatches dispatch join public.inventory_transfer_items item on item.id = dispatch.transfer_item_id
          where dispatch.request_line_id = request_line.id),0),0))
        from public.material_requests request join public.material_request_lines request_line on request_line.request_id = request.id
        where request.project_id = line.project_id and request.project_site_id = line.project_site_id
          and request.source_warehouse_id = line.warehouse_id and request_line.material_id = line.material_id
          and request.status in ('submitted','approved','partially_approved')),0) as in_request
    from public.project_material_plan_lines line
    join public.project_sites site on site.id = line.project_site_id
    join public.warehouses warehouse on warehouse.id = line.warehouse_id
    join public.materials material on material.id = line.material_id
    join public.units_of_measure unit on unit.id = material.base_unit_id
    where line.project_id = p_project_id
      and private.can_access_project_site(line.project_id,line.project_site_id)
  ), needs as (
    select fact.*, greatest(fact.planned_quantity-fact.used_qty-fact.at_site-fact.in_request,0) as need_qty from facts fact
  ), allocated as (
    select need.*, coalesce(sum(need.need_qty) over (
      partition by need.warehouse_id,need.material_id order by need.required_on,need.id
      rows between unbounded preceding and 1 preceding),0) as earlier_need from needs need
  )
  select plan_row.id,plan_row.project_site_id,plan_row.site_label,plan_row.warehouse_id,plan_row.warehouse_label,
    plan_row.material_id,plan_row.sku,plan_row.material_label,plan_row.unit_label,plan_row.planned_quantity,plan_row.required_on,
    plan_row.note,plan_row.used_qty,plan_row.at_site,plan_row.at_warehouse,plan_row.in_request,plan_row.need_qty,
    greatest(plan_row.need_qty-greatest(plan_row.at_warehouse-plan_row.earlier_need,0),0)
  from allocated plan_row order by plan_row.required_on,plan_row.sku;
end;
$$;
revoke all on function public.get_project_material_plan(uuid) from public, anon;
grant execute on function public.get_project_material_plan(uuid) to authenticated;

create or replace function public.get_requestable_equipment(p_project_id uuid, p_project_site_id uuid)
returns table (asset_id uuid, asset_code text, asset_name text)
language sql stable security definer set search_path = '' as $$
  select asset.id,asset.code,asset.name from public.assets asset
  join public.asset_locations asset_location on asset_location.id = asset.current_location_id
  join public.inventory_locations location on location.id = asset_location.inventory_location_id
  join public.projects project on project.id = p_project_id and project.status = 'active' and project.archived_at is null
  join public.project_sites target_site on target_site.id = p_project_site_id and target_site.project_id = project.id and target_site.status = 'active'
  left join public.project_warehouses project_warehouse on project_warehouse.warehouse_id = location.warehouse_id and project_warehouse.project_id = p_project_id
  left join public.warehouses warehouse on warehouse.id = project_warehouse.warehouse_id and warehouse.status = 'active'
  left join public.project_sites source_site on source_site.id = location.project_site_id and source_site.project_id = p_project_id
  where auth.uid() is not null and not private.can_manage_assets()
    and private.has_any_role(array['engineer','foreman']::public.app_role[])
    and private.can_access_project_site(p_project_id,p_project_site_id)
    and asset.asset_kind = 'equipment' and asset.archived_at is null and asset.status = 'available'
    and asset_location.archived_at is null
    and (warehouse.id is not null or source_site.id = target_site.id)
    and not exists (select 1 from public.equipment_requests request
      where request.asset_id = asset.id and request.status in ('approved','checked_out'))
  order by asset.code limit 300;
$$;
revoke all on function public.get_requestable_equipment(uuid,uuid) from public, anon;
grant execute on function public.get_requestable_equipment(uuid,uuid) to authenticated;

create or replace function private.enforce_equipment_usage_site_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.assets asset
    join public.asset_locations asset_location on asset_location.id = asset.current_location_id
    join public.inventory_locations location on location.id = asset_location.inventory_location_id
    join public.project_sites site on site.id = location.project_site_id
    where asset.id = new.asset_id and site.project_id = new.project_id
      and private.can_access_project_site(site.project_id,site.id)) then
    raise exception 'equipment must be assigned to a site you can access' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_equipment_usage_site_scope() from public, anon, authenticated;
drop trigger if exists project_equipment_usage_site_scope on public.project_equipment_usage;
create trigger project_equipment_usage_site_scope before insert on public.project_equipment_usage
for each row execute function private.enforce_equipment_usage_site_scope();
