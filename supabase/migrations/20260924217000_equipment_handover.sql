-- Equipment requests reserve custody only. Hours and project cost remain separate posted records.
create table public.equipment_requests (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  asset_code text not null,
  asset_name text not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  needed_on date not null,
  expected_return_on date not null,
  purpose text not null check (char_length(trim(purpose)) between 3 and 500),
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','checked_out','returned')),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  source_location_id uuid references public.asset_locations(id) on delete restrict,
  checked_out_by uuid references public.profiles(id) on delete restrict,
  checked_out_at timestamptz,
  returned_by uuid references public.profiles(id) on delete restrict,
  returned_at timestamptz,
  return_note text check (return_note is null or char_length(return_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_requests_site_project_fk foreign key (project_id, project_site_id)
    references public.project_sites(project_id, id) on delete restrict,
  constraint equipment_requests_dates check (expected_return_on >= needed_on),
  constraint equipment_requests_decision_pair check ((decided_by is null) = (decided_at is null)),
  constraint equipment_requests_checkout_pair check ((checked_out_by is null) = (checked_out_at is null)),
  constraint equipment_requests_return_pair check ((returned_by is null) = (returned_at is null))
);

-- A warehouse with a registered, unarchived asset is still an operational location.
do $$ begin
  if exists (
    select 1 from public.warehouses w
    join public.inventory_locations il on il.warehouse_id = w.id
    join public.asset_locations al on al.inventory_location_id = il.id
    join public.assets a on a.current_location_id = al.id and a.archived_at is null
    where w.status = 'inactive'
  ) then
    raise exception 'Relocate assets from inactive warehouses before applying equipment custody migration';
  end if;
end $$;

create function private.guard_warehouse_asset_deactivation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'inactive' and exists (
    select 1 from public.inventory_locations il
    join public.asset_locations al on al.inventory_location_id = il.id
    join public.assets a on a.current_location_id = al.id and a.archived_at is null
    where il.warehouse_id = new.id
  ) then
    raise exception 'Relocate active assets before marking this warehouse inactive' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger warehouses_guard_asset_deactivation before update of status on public.warehouses
  for each row execute function private.guard_warehouse_asset_deactivation();
revoke execute on function private.guard_warehouse_asset_deactivation() from public, anon, authenticated;

-- Registry edits and new assets must not put custody back into an inactive warehouse.
-- The row lock serializes this check with a concurrent warehouse deactivation.
create function private.guard_active_asset_warehouse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_warehouse_id uuid; v_status public.warehouse_status;
begin
  if new.archived_at is not null then return new; end if;
  select il.warehouse_id into v_warehouse_id
  from public.asset_locations al
  join public.inventory_locations il on il.id = al.inventory_location_id
  where al.id = new.current_location_id;
  if v_warehouse_id is not null then
    select status into v_status from public.warehouses where id = v_warehouse_id for share;
    if v_status is distinct from 'active' then
      raise exception 'An active asset cannot be placed in an inactive warehouse' using errcode = '22023';
    end if;
  end if;
  return new;
end; $$;
create trigger assets_guard_active_warehouse
  before insert or update of current_location_id, archived_at on public.assets
  for each row execute function private.guard_active_asset_warehouse();
revoke execute on function private.guard_active_asset_warehouse() from public, anon, authenticated;
create index equipment_requests_project_status_idx on public.equipment_requests (project_id, status, created_at desc);
create index equipment_requests_requester_idx on public.equipment_requests (requested_by, created_at desc);
create unique index equipment_requests_one_custody_per_asset on public.equipment_requests (asset_id)
  where status in ('approved','checked_out');
create unique index equipment_requests_no_duplicate_submission on public.equipment_requests
  (asset_id, project_id, project_site_id, requested_by) where status = 'submitted';

create trigger equipment_requests_set_updated_at before update on public.equipment_requests
  for each row execute function private.set_updated_at();
create trigger equipment_requests_audit after insert or update or delete on public.equipment_requests
  for each row execute function private.audit_row_change();

alter table public.equipment_requests enable row level security;
revoke all on public.equipment_requests from public, anon, authenticated;
grant select on public.equipment_requests to authenticated;
create policy equipment_requests_read on public.equipment_requests for select to authenticated
  using (private.can_manage_assets() or (requested_by = (select auth.uid())
      and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active))
    or (private.has_any_role(array['engineer','foreman']::public.app_role[])
      and private.can_access_project(project_id)));

create function public.get_requestable_equipment(p_project_id uuid, p_project_site_id uuid)
returns table (asset_id uuid, asset_code text, asset_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.code, a.name from public.assets a
  join public.asset_locations al on al.id = a.current_location_id
  join public.inventory_locations il on il.id = al.inventory_location_id
  join public.projects p on p.id = p_project_id and p.status = 'active' and p.archived_at is null
  join public.project_sites target on target.id = p_project_site_id and target.project_id = p.id and target.status = 'active'
  left join public.project_warehouses pw on pw.warehouse_id = il.warehouse_id and pw.project_id = p_project_id
  left join public.warehouses w on w.id = pw.warehouse_id and w.status = 'active'
  left join public.project_sites ps on ps.id = il.project_site_id and ps.project_id = p_project_id
  where (select auth.uid()) is not null
    and not private.can_manage_assets()
    and private.has_any_role(array['engineer','foreman']::public.app_role[])
    and private.can_access_project(p_project_id)
    and a.asset_kind = 'equipment' and a.archived_at is null and a.status = 'available'
    and al.archived_at is null and (w.id is not null or ps.id = target.id)
    and not exists (select 1 from public.equipment_requests er
      where er.asset_id = a.id and er.status in ('approved','checked_out'))
  order by a.code limit 300
$$;

-- Only the handover RPC may authorize an assigned asset's return through the custody guard.
create table private.asset_return_authorizations (
  asset_id uuid not null,
  transaction_id bigint not null,
  request_id uuid not null,
  target_location_id uuid not null,
  target_status public.asset_status not null,
  primary key (asset_id, transaction_id)
);
revoke all on private.asset_return_authorizations from public, anon, authenticated;

create function private.lock_active_asset_warehouse(p_location_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_warehouse_id uuid; v_status public.warehouse_status;
begin
  select il.warehouse_id into v_warehouse_id
  from public.asset_locations al join public.inventory_locations il on il.id = al.inventory_location_id
  where al.id = p_location_id;
  if v_warehouse_id is not null then
    select status into v_status from public.warehouses where id = v_warehouse_id for share;
    if v_status <> 'active' then raise exception 'Equipment warehouse is inactive' using errcode = '22023'; end if;
  end if;
end; $$;
revoke execute on function private.lock_active_asset_warehouse(uuid) from public, anon, authenticated;

create function private.equipment_source_for_project(p_location_id uuid, p_project_id uuid, p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    join public.project_sites target on target.project_id = p.id and target.id = p_site_id and target.status = 'active'
    join public.asset_locations al on al.id = p_location_id and al.archived_at is null
    join public.inventory_locations il on il.id = al.inventory_location_id
    left join public.project_warehouses pw on pw.project_id = p.id and pw.warehouse_id = il.warehouse_id
    left join public.warehouses w on w.id = pw.warehouse_id and w.status = 'active'
    where p.id = p_project_id and p.status = 'active' and p.archived_at is null
      and (w.id is not null or il.project_site_id = target.id)
  )
$$;
revoke execute on function private.equipment_source_for_project(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function private.protect_assigned_asset_custody()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('assigned','in_use')
    and (new.status is distinct from old.status or new.current_location_id is distinct from old.current_location_id) then
    if old.asset_kind <> 'equipment' or not exists (
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

create function public.submit_equipment_request(
  p_asset_id uuid, p_project_id uuid, p_project_site_id uuid,
  p_needed_on date, p_expected_return_on date, p_purpose text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_asset public.assets; v_id uuid;
begin
  if v_actor is null or private.can_manage_assets()
    or not private.has_any_role(array['engineer','foreman']::public.app_role[])
    or not private.can_access_project(p_project_id) then
    raise exception 'Not authorized for this project' using errcode = '42501';
  end if;
  if p_needed_on is null or p_expected_return_on is null or p_expected_return_on < p_needed_on
    or p_needed_on < current_date - 1 or p_needed_on > current_date + 365
    or p_expected_return_on > p_needed_on + 365
    or char_length(trim(coalesce(p_purpose, ''))) not between 3 and 500 then
    raise exception 'Invalid equipment request' using errcode = '22023';
  end if;
  if not exists(select 1 from public.projects p join public.project_sites s on s.project_id = p.id
    where p.id = p_project_id and s.id = p_project_site_id and p.status = 'active'
      and p.archived_at is null and s.status = 'active') then
    raise exception 'Select an active project site' using errcode = '22023';
  end if;
  select * into v_asset from public.assets where id = p_asset_id and asset_kind = 'equipment'
    and archived_at is null for update;
  if v_asset.id is null or v_asset.status <> 'available' then
    raise exception 'Equipment is not available' using errcode = '22023';
  end if;
  if not private.equipment_source_for_project(v_asset.current_location_id, p_project_id, p_project_site_id) then
    raise exception 'Equipment must be at the project site or a linked warehouse' using errcode = '22023';
  end if;
  insert into public.equipment_requests (asset_id, asset_code, asset_name, project_id, project_site_id, requested_by,
    needed_on, expected_return_on, purpose)
  values (p_asset_id, v_asset.code, v_asset.name, p_project_id, p_project_site_id, v_actor,
    p_needed_on, p_expected_return_on, trim(p_purpose)) returning id into v_id;
  return v_id;
end; $$;

create function public.decide_equipment_request(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_request public.equipment_requests; v_asset public.assets;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'Admin approval required' using errcode = '42501'; end if;
  if p_approve is null or char_length(trim(coalesce(p_note, ''))) > 500
    or (not p_approve and char_length(trim(coalesce(p_note, ''))) < 3) then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  select * into v_request from public.equipment_requests where id = p_id for update;
  if v_request.id is null or v_request.status not in ('submitted','approved')
    or (p_approve and v_request.status <> 'submitted') then
    raise exception 'Request is not pending or approved for withdrawal' using errcode = '22023';
  end if;
  if p_approve then
    select * into v_asset from public.assets where id = v_request.asset_id for update;
    if v_asset.status <> 'available' or v_asset.archived_at is not null
      or not private.equipment_source_for_project(v_asset.current_location_id, v_request.project_id, v_request.project_site_id) then
      raise exception 'Equipment is no longer available' using errcode = '22023';
    end if;
    update public.equipment_requests set status = 'approved', decided_by = v_actor,
      decided_at = now(), decision_note = nullif(trim(p_note), ''), source_location_id = v_asset.current_location_id
      where id = p_id;
  else
    update public.equipment_requests set status = 'rejected', decided_by = v_actor,
      decided_at = now(), decision_note = trim(p_note), source_location_id = null where id = p_id;
  end if;
end; $$;

create function public.checkout_equipment_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_request public.equipment_requests;
  v_asset public.assets; v_target_location uuid;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'Admin handover required' using errcode = '42501'; end if;
  select * into v_request from public.equipment_requests where id = p_id for update;
  if v_request.id is null or v_request.status <> 'approved' then raise exception 'Request is not approved' using errcode = '22023'; end if;
  select * into v_asset from public.assets where id = v_request.asset_id for update;
  if v_asset.status <> 'available' or v_asset.archived_at is not null
    or v_asset.current_location_id is distinct from v_request.source_location_id
    or not private.equipment_source_for_project(v_asset.current_location_id, v_request.project_id, v_request.project_site_id) then
    raise exception 'Equipment custody changed; review the request' using errcode = '22023';
  end if;
  perform private.lock_active_asset_warehouse(v_asset.current_location_id);
  select al.id into v_target_location from public.asset_locations al
    join public.inventory_locations il on il.id = al.inventory_location_id
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where ps.id = v_request.project_site_id and ps.project_id = v_request.project_id
      and ps.status = 'active' and p.status = 'active' and p.archived_at is null and al.archived_at is null;
  if v_target_location is null then raise exception 'Project site is unavailable' using errcode = '22023'; end if;
  update public.assets set status = 'assigned', current_location_id = v_target_location,
    updated_by = v_actor where id = v_asset.id;
  update public.equipment_requests set status = 'checked_out', checked_out_by = v_actor,
    checked_out_at = now() where id = p_id;
  perform private.record_asset_event(v_asset.id, 'location_changed', v_asset.status, 'assigned',
    v_asset.current_location_id, v_target_location, 'Equipment checked out to project site',
    jsonb_build_object('request_id', p_id, 'project_id', v_request.project_id), v_actor);
end; $$;

create function public.return_equipment_request(p_id uuid, p_needs_maintenance boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_request public.equipment_requests;
  v_asset public.assets; v_target_status public.asset_status;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'Admin return required' using errcode = '42501'; end if;
  if p_needs_maintenance is null or char_length(trim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'Record the return condition' using errcode = '22023';
  end if;
  select * into v_request from public.equipment_requests where id = p_id for update;
  if v_request.id is null or v_request.status <> 'checked_out' or v_request.source_location_id is null then
    raise exception 'Equipment is not checked out' using errcode = '22023';
  end if;
  select * into v_asset from public.assets where id = v_request.asset_id for update;
  if v_asset.status not in ('assigned','in_use') or v_asset.archived_at is not null
    or not exists (select 1 from public.asset_locations al join public.inventory_locations il on il.id = al.inventory_location_id
      where al.id = v_asset.current_location_id and il.project_site_id = v_request.project_site_id) then
    raise exception 'Equipment custody does not match this request' using errcode = '22023';
  end if;
  if not exists(select 1 from public.asset_locations where id = v_request.source_location_id and archived_at is null) then
    raise exception 'Original location is archived; resolve custody before return' using errcode = '22023';
  end if;
  perform private.lock_active_asset_warehouse(v_request.source_location_id);
  v_target_status := case when p_needs_maintenance then 'under_maintenance'::public.asset_status else 'available'::public.asset_status end;
  insert into private.asset_return_authorizations (asset_id, transaction_id, request_id, target_location_id, target_status)
    values (v_asset.id, pg_catalog.txid_current(), p_id, v_request.source_location_id, v_target_status);
  update public.assets set status = v_target_status, current_location_id = v_request.source_location_id,
    condition_notes = case when p_needs_maintenance then trim(p_note) else condition_notes end,
    updated_by = v_actor where id = v_asset.id;
  update public.equipment_requests set status = 'returned', returned_by = v_actor,
    returned_at = now(), return_note = trim(p_note) where id = p_id;
  perform private.record_asset_event(v_asset.id, 'location_changed', v_asset.status, v_target_status,
    v_asset.current_location_id, v_request.source_location_id, 'Equipment returned from project site',
    jsonb_build_object('request_id', p_id, 'project_id', v_request.project_id, 'needs_maintenance', p_needs_maintenance, 'note', trim(p_note)), v_actor);
end; $$;

revoke execute on function public.submit_equipment_request(uuid,uuid,uuid,date,date,text),
  public.decide_equipment_request(uuid,boolean,text), public.checkout_equipment_request(uuid),
  public.return_equipment_request(uuid,boolean,text), public.get_requestable_equipment(uuid,uuid) from public, anon;
grant execute on function public.submit_equipment_request(uuid,uuid,uuid,date,date,text),
  public.decide_equipment_request(uuid,boolean,text), public.checkout_equipment_request(uuid),
  public.return_equipment_request(uuid,boolean,text), public.get_requestable_equipment(uuid,uuid) to authenticated;
