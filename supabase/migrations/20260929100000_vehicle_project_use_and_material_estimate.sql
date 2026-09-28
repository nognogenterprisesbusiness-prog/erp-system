-- 1. Vehicles use the same request, handover, hourly-rate and project-costing
--    flow as equipment. Only the equipment-only asset checks change; every
--    authorization, custody, idempotency and 24-hour rule is kept as-is.
-- 2. Admin-only material cost estimate for a project's material plan, priced
--    from the latest current supplier price, else the warehouse average cost.

create or replace function public.set_equipment_hour_rate(p_asset_id uuid, p_hourly_rate numeric, p_effective_start_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_asset public.assets; v_current public.equipment_hour_rates; v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can set equipment rates' using errcode = '42501';
  end if;
  if p_asset_id is null or p_hourly_rate is null or p_hourly_rate <= 0 or p_hourly_rate <> round(p_hourly_rate, 2)
    or p_effective_start_date is null then raise exception 'Invalid equipment rate' using errcode = '22023'; end if;
  select * into v_asset from public.assets where id = p_asset_id for update;
  if v_asset.id is null or v_asset.archived_at is not null then
    raise exception 'Equipment or vehicle is unavailable' using errcode = '22023';
  end if;
  if exists(select 1 from public.equipment_hour_rates where asset_id = p_asset_id
    and effective_start_date >= p_effective_start_date) then
    raise exception 'A rate already starts on or after this date' using errcode = '22023';
  end if;
  select * into v_current from public.equipment_hour_rates
    where asset_id = p_asset_id and effective_end_date is null for update;
  if v_current.id is not null then
    if p_effective_start_date <= v_current.effective_start_date then
      raise exception 'New rate must start after the current rate' using errcode = '22023';
    end if;
    update public.equipment_hour_rates set effective_end_date = p_effective_start_date - 1 where id = v_current.id;
  end if;
  if exists(select 1 from public.equipment_hour_rates where asset_id = p_asset_id
    and effective_start_date <= p_effective_start_date
    and (effective_end_date is null or effective_end_date >= p_effective_start_date)) then
    raise exception 'Equipment rate periods cannot overlap' using errcode = '22023';
  end if;
  insert into public.equipment_hour_rates (id, asset_id, hourly_rate, effective_start_date, approved_by)
  values (v_id, p_asset_id, p_hourly_rate, p_effective_start_date, v_actor);
  return v_id;
end;
$$;

create or replace function public.post_project_equipment_usage(
  p_idempotency_key uuid, p_project_id uuid, p_asset_id uuid,
  p_use_date date, p_hours numeric, p_work_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.project_equipment_usage;
  v_asset public.assets;
  v_rate public.equipment_hour_rates;
  v_total_hours numeric;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or p_project_id is null or not private.can_record_project_attendance(p_project_id) then
    raise exception 'Only an administrator or assigned foreman can record equipment hours' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_asset_id is null or p_use_date is null
    or p_hours is null or p_hours <= 0 or p_hours > 24 or p_hours <> round(p_hours, 2)
    or char_length(trim(coalesce(p_work_note, ''))) not between 3 and 500 then
    raise exception 'Invalid equipment usage' using errcode = '22023';
  end if;
  if p_use_date > current_date then
    raise exception 'Equipment use date cannot be in the future' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('project', p_project_id, 'asset', p_asset_id,
    'date', p_use_date, 'hours', p_hours, 'note', trim(p_work_note));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_equipment_usage where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another usage' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  select * into v_asset from public.assets where id = p_asset_id for update;
  if v_asset.id is null or v_asset.archived_at is not null
    or v_asset.status not in ('available','assigned','in_use') then
    raise exception 'Equipment or vehicle is unavailable' using errcode = '22023';
  end if;
  if not exists(
    select 1
    from public.asset_locations al
    join public.inventory_locations il on il.id = al.inventory_location_id
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where al.id = v_asset.current_location_id
      and ps.project_id = p_project_id
      and p.archived_at is null
      and p.status in ('active','on_hold')
      and ps.status = 'active'
  ) then
    raise exception 'Equipment must be located at an active site in this project' using errcode = '22023';
  end if;
  if exists(
    select 1
    from public.project_equipment_usage u
    left join public.project_equipment_usage_reversals r on r.usage_id = u.id
    where u.asset_id = p_asset_id and u.project_id = p_project_id and u.use_date = p_use_date and r.id is null
  ) then
    raise exception 'Equipment usage already posted for this project and date' using errcode = '23505';
  end if;
  select coalesce(sum(u.hours_used), 0) into v_total_hours
  from public.project_equipment_usage u
  left join public.project_equipment_usage_reversals r on r.usage_id = u.id
  where u.asset_id = p_asset_id and u.use_date = p_use_date and r.id is null;
  if v_total_hours + p_hours > 24 then
    raise exception 'Equipment usage exceeds 24 hours for this date' using errcode = '22023';
  end if;

  select * into v_rate
  from public.equipment_hour_rates
  where asset_id = p_asset_id
    and effective_start_date <= p_use_date
    and (effective_end_date is null or effective_end_date >= p_use_date)
  order by effective_start_date desc
  limit 1;
  if v_rate.id is null then
    raise exception 'No approved equipment rate for this date' using errcode = '22023';
  end if;

  insert into public.project_equipment_usage (
    id, project_id, asset_id, asset_code, asset_name, use_date, hours_used,
    rate_id, hourly_rate_snapshot, cost_total, work_note, recorded_by,
    idempotency_key, command_payload
  ) values (
    v_id, p_project_id, p_asset_id, v_asset.code, v_asset.name, p_use_date,
    p_hours, v_rate.id, v_rate.hourly_rate, round(p_hours * v_rate.hourly_rate, 2),
    trim(p_work_note), v_actor, p_idempotency_key, v_payload
  );
  return v_id;
end;
$$;

-- Return type gains asset_kind, so the function must be dropped first.
drop function public.get_requestable_equipment(uuid, uuid);
create function public.get_requestable_equipment(p_project_id uuid, p_project_site_id uuid)
returns table (asset_id uuid, asset_code text, asset_name text, asset_kind public.asset_kind)
language sql stable security definer set search_path = '' as $$
  select asset.id,asset.code,asset.name,asset.asset_kind from public.assets asset
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
    and asset.archived_at is null and asset.status = 'available'
    and asset_location.archived_at is null
    and (warehouse.id is not null or source_site.id = target_site.id)
    and not exists (select 1 from public.equipment_requests request
      where request.asset_id = asset.id and request.status in ('approved','checked_out'))
  order by asset.code limit 300;
$$;
revoke all on function public.get_requestable_equipment(uuid,uuid) from public, anon;
grant execute on function public.get_requestable_equipment(uuid,uuid) to authenticated;

-- Checked-out vehicles now need the same audited return as equipment.
create or replace function private.protect_assigned_asset_custody()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('assigned','in_use')
    and (new.status is distinct from old.status or new.current_location_id is distinct from old.current_location_id) then
    if not exists (
      select 1 from private.asset_return_authorizations a
      join public.equipment_requests r on r.id = a.request_id
      where a.asset_id = old.id and a.transaction_id = pg_catalog.txid_current()
        and a.target_location_id = new.current_location_id and a.target_status = new.status
        and r.asset_id = old.id and r.status = 'checked_out'
        and r.checked_out_by is not null and r.returned_at is null
    ) then
      raise exception 'Return the assigned asset through an audited handover before changing its status or location'
        using errcode = 'P0001';
    end if;
    delete from private.asset_return_authorizations
      where asset_id = old.id and transaction_id = pg_catalog.txid_current();
  end if;
  return new;
end; $$;

create or replace function public.submit_equipment_request(
  p_asset_id uuid,
  p_project_id uuid,
  p_project_site_id uuid,
  p_needed_on date,
  p_expected_return_on date,
  p_purpose text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_asset public.assets%rowtype;
  v_id uuid;
begin
  if v_actor is null
     or private.can_manage_assets()
     or not private.has_any_role(array['engineer','foreman']::public.app_role[])
     or not private.can_access_project_site(p_project_id, p_project_site_id) then
    raise exception 'Not authorized for this project site' using errcode = '42501';
  end if;

  if p_needed_on is null
     or p_expected_return_on is null
     or p_expected_return_on < p_needed_on
     or p_needed_on < current_date - 1
     or p_needed_on > current_date + 365
     or p_expected_return_on > p_needed_on + 365
     or char_length(trim(coalesce(p_purpose, ''))) not between 3 and 500 then
    raise exception 'Invalid equipment request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.projects project
    join public.project_sites site on site.project_id = project.id
    where project.id = p_project_id
      and site.id = p_project_site_id
      and project.status = 'active'
      and project.archived_at is null
      and site.status = 'active'
  ) then
    raise exception 'Select an active project site' using errcode = '22023';
  end if;

  select * into v_asset
  from public.assets
  where id = p_asset_id
    and archived_at is null
  for update;

  if v_asset.id is null or v_asset.status <> 'available' then
    raise exception 'Equipment or vehicle is not available' using errcode = '22023';
  end if;

  if not private.equipment_source_for_project(
    v_asset.current_location_id,
    p_project_id,
    p_project_site_id
  ) then
    raise exception 'Equipment must be at the project site or a linked warehouse' using errcode = '22023';
  end if;

  insert into public.equipment_requests (
    asset_id,
    asset_code,
    asset_name,
    project_id,
    project_site_id,
    requested_by,
    needed_on,
    expected_return_on,
    purpose
  ) values (
    p_asset_id,
    v_asset.code,
    v_asset.name,
    p_project_id,
    p_project_site_id,
    v_actor,
    p_needed_on,
    p_expected_return_on,
    trim(p_purpose)
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Mobile equipment options include vehicles and report which kind each row is.
create or replace function public.get_mobile_site_operations(p_kind text,p_project_id uuid,p_site_id uuid,
  p_date date default current_date,p_search text default '',p_offset integer default 0,p_limit integer default 20)
returns table(record jsonb,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_view_mobile_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for project site' using errcode='42501'; end if;
  if p_offset<0 or p_limit not between 1 and 100 or length(coalesce(p_search,''))>100 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  if p_kind='workers' then
    return query select jsonb_build_object('id',a.id,'employee_id',e.id,'name',concat(e.first_name,' ',e.last_name),
      'project_site_id',a.project_site_id,'basis',case when private.mobile_site_role(p_project_id,p_site_id,'foreman') then
        coalesce(b.rate_type,(select case when count(distinct r.rate_type)=1 then min(r.rate_type::text)::public.labor_rate_type end
          from public.labor_rates r where r.employee_id=e.id and r.effective_start_date<=p_date and (r.effective_end_date is null or r.effective_end_date>=p_date))) end),count(*) over()
    from public.employee_project_assignments a join public.employees e on e.id=a.employee_id
    left join public.employee_attendance_basis b on b.employee_id=e.id
    where a.project_id=p_project_id and a.project_site_id=p_site_id and a.start_date<=p_date
      and (a.end_date is null or a.end_date>=p_date) and e.archived_at is null and e.status='active'
      and position(lower(coalesce(p_search,'')) in lower(concat(e.first_name,' ',e.last_name,' ',e.code)))>0
    order by e.last_name,e.first_name,a.id offset p_offset limit p_limit;
  elsif p_kind='attendance' then
    return query select jsonb_build_object('id',a.id,'employee_id',e.id,'name',concat(e.first_name,' ',e.last_name),
      'project_site_id',a.project_site_id,'work_date',a.work_date,'attendance_status',a.attendance_status,
      'hours_worked',a.hours_worked,'note',a.note,'reversed',exists(select 1 from public.project_attendance_reversals r where r.attendance_id=a.id)),count(*) over()
    from public.project_attendance a join public.employees e on e.id=a.employee_id
    where a.project_id=p_project_id and a.project_site_id=p_site_id and a.work_date=p_date
      and position(lower(coalesce(p_search,'')) in lower(concat(e.first_name,' ',e.last_name)))>0
    order by e.last_name,a.id offset p_offset limit p_limit;
  elsif p_kind='equipment-history' then
    return query select jsonb_build_object('id',a.id,'name',a.asset_name,'date',a.use_date,
      'hours',a.hours_used,'note',a.work_note,'reversed',exists(select 1 from public.project_equipment_usage_reversals r where r.usage_id=a.id)),count(*) over()
    from public.project_equipment_usage a where a.project_id=p_project_id and a.project_site_id=p_site_id
      and position(lower(coalesce(p_search,'')) in lower(a.asset_name))>0
    order by a.use_date desc,a.id offset p_offset limit p_limit;
  elsif p_kind='equipment-options' then
    return query select jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'kind',a.asset_kind),count(*) over()
    from public.assets a join public.asset_locations al on al.id=a.current_location_id and al.archived_at is null
    join public.inventory_locations location on location.id=al.inventory_location_id
    join public.projects project on project.id=p_project_id and project.status='active' and project.archived_at is null
    where a.archived_at is null and a.status='available'
      and (location.project_site_id=p_site_id or exists (
        select 1 from public.project_warehouses pw join public.warehouses w on w.id=pw.warehouse_id and w.status='active'
        where pw.project_id=p_project_id and pw.warehouse_id=location.warehouse_id
      ))
      and not exists(select 1 from public.equipment_requests request where request.asset_id=a.id and request.status in ('approved','checked_out'))
      and position(lower(coalesce(p_search,'')) in lower(concat(a.code,' ',a.name)))>0
    order by a.name,a.id offset p_offset limit p_limit;
  else raise exception 'Unknown operational view' using errcode='22023'; end if;
end;
$$;

-- Planned quantity x latest current supplier price (base unit, PHP). Without a
-- supplier price, the plan warehouse's average stock cost is used instead.
create function public.get_project_material_estimate(p_project_id uuid)
returns table(plan_line_id uuid, unit_cost numeric, price_source text, estimated_cost numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_manage_projects() then
    raise exception 'Not authorized to view project cost estimates' using errcode = '42501'; end if;
  return query
  select l.id, price.unit_cost, price.source, round(l.planned_quantity * price.unit_cost, 2)
  from public.project_material_plan_lines l
  join public.materials m on m.id = l.material_id
  left join lateral (
    select sp.unit_price
    from public.supplier_materials sm
    join public.suppliers s on s.id = sm.supplier_id
    join public.supplier_prices sp on sp.supplier_material_id = sm.id
    where sm.material_id = l.material_id and sm.unit_of_measure_id = m.base_unit_id
      and sm.archived_at is null and s.archived_at is null and s.status = 'active'
      and sp.currency = 'PHP' and sp.effective_start_date <= current_date
      and (sp.effective_end_date is null or sp.effective_end_date >= current_date)
    order by sp.effective_start_date desc, sp.unit_price, sp.id
    limit 1
  ) supplier on true
  left join lateral (
    select round(sum(v.total_value) / sum(v.quantity_on_hand), 2) as average_cost
    from public.inventory_valuations v
    join public.inventory_locations loc on loc.id = v.inventory_location_id
    where loc.warehouse_id = l.warehouse_id and v.material_id = l.material_id
      and v.quantity_on_hand > 0 and v.total_value is not null
  ) stock on true
  cross join lateral (
    select coalesce(supplier.unit_price, stock.average_cost) as unit_cost,
      case when supplier.unit_price is not null then 'supplier'
        when stock.average_cost is not null then 'stock' end as source
  ) price
  where l.project_id = p_project_id
  order by l.required_on, l.id;
end; $$;
revoke all on function public.get_project_material_estimate(uuid) from public, anon;
grant execute on function public.get_project_material_estimate(uuid) to authenticated;
