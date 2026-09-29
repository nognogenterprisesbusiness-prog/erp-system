-- A site employee may report missing stock without creating a catalog SKU or
-- posting a stock receipt. Admin closes the report after sourcing or review.
create table public.material_sourcing_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  payload_hash text not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null references public.project_sites(id) on delete restrict,
  source_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  project_name text not null,
  site_name text not null,
  warehouse_name text not null,
  material_name text not null check (char_length(trim(material_name)) between 2 and 160),
  unit_name text not null check (char_length(trim(unit_name)) between 1 and 40),
  requested_quantity numeric(20,4) not null check (requested_quantity > 0),
  needed_on date not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'submitted' check (status in ('submitted','resolved','dismissed')),
  catalog_material_id uuid references public.materials(id) on delete restrict,
  resolution_note text,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint material_sourcing_resolution check (
    (status = 'submitted' and resolved_by is null and resolved_at is null and resolution_note is null and catalog_material_id is null)
    or (status = 'resolved' and resolved_by is not null and resolved_at is not null and catalog_material_id is not null and char_length(trim(resolution_note)) between 3 and 500)
    or (status = 'dismissed' and resolved_by is not null and resolved_at is not null and catalog_material_id is null and char_length(trim(resolution_note)) between 3 and 500)
  )
);
create index material_sourcing_requests_project_idx on public.material_sourcing_requests(project_id, created_at desc);
create index material_sourcing_requests_status_idx on public.material_sourcing_requests(status, created_at desc);
alter table public.material_sourcing_requests enable row level security;
revoke all on public.material_sourcing_requests from public, anon, authenticated;
grant select on public.material_sourcing_requests to authenticated;
create policy material_sourcing_requests_scoped_read on public.material_sourcing_requests
for select to authenticated using (
  requested_by = auth.uid() or private.can_access_project_site(project_id, project_site_id)
);
create trigger material_sourcing_requests_audit
after insert or update on public.material_sourcing_requests
for each row execute function private.audit_row_change();

create function public.submit_material_sourcing_request(
  p_key uuid, p_project_id uuid, p_site_id uuid, p_warehouse_id uuid,
  p_material_name text, p_unit_name text, p_quantity numeric,
  p_needed_on date, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_hash text;
  v_existing public.material_sourcing_requests%rowtype;
  v_project public.projects%rowtype;
  v_site public.project_sites%rowtype;
  v_warehouse public.warehouses%rowtype;
  v_id uuid;
begin
  if v_actor is null or p_key is null or p_needed_on is null or p_needed_on < (now() at time zone 'Asia/Manila')::date
    or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
    or p_quantity <> round(p_quantity, 4)
    or char_length(trim(coalesce(p_material_name,''))) not between 2 and 160
    or char_length(trim(coalesce(p_unit_name,''))) not between 1 and 40
    or char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Invalid material sourcing request' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('project',p_project_id,'site',p_site_id,'warehouse',p_warehouse_id,
    'material',trim(p_material_name),'unit',trim(p_unit_name),'quantity',p_quantity,
    'needed_on',p_needed_on,'reason',trim(p_reason))::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  select * into v_existing from public.material_sourcing_requests where idempotency_key = p_key;
  if found then
    if v_existing.requested_by <> v_actor or v_existing.payload_hash <> v_hash then
      raise exception 'Idempotency key already used for another report' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if not private.has_any_role(array['engineer','foreman']::public.app_role[])
    or not private.can_access_project_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for this project site' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = p_project_id and status = 'active' and archived_at is null;
  select * into v_site from public.project_sites where id = p_site_id and project_id = p_project_id and status = 'active';
  select warehouse.* into v_warehouse from public.warehouses warehouse
    join public.project_warehouses link on link.warehouse_id = warehouse.id
    where warehouse.id = p_warehouse_id and warehouse.status = 'active' and link.project_id = p_project_id;
  if v_project.id is null or v_site.id is null or v_warehouse.id is null then
    raise exception 'Project, site, or source warehouse is unavailable' using errcode = '22023';
  end if;
  insert into public.material_sourcing_requests (
    idempotency_key,payload_hash,project_id,project_site_id,source_warehouse_id,
    project_name,site_name,warehouse_name,material_name,unit_name,requested_quantity,
    needed_on,reason,requested_by
  ) values (
    p_key,v_hash,p_project_id,p_site_id,p_warehouse_id,
    v_project.name,v_site.name,v_warehouse.name,trim(p_material_name),trim(p_unit_name),
    p_quantity,p_needed_on,trim(p_reason),v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

create function public.resolve_material_sourcing_request(
  p_id uuid, p_action text, p_material_id uuid, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_row public.material_sourcing_requests%rowtype;
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can resolve material sourcing requests' using errcode = '42501';
  end if;
  if p_action not in ('resolved','dismissed') or char_length(trim(coalesce(p_note,''))) not between 3 and 500 then
    raise exception 'Invalid resolution' using errcode = '22023';
  end if;
  select * into v_row from public.material_sourcing_requests where id = p_id for update;
  if v_row.id is null or v_row.status <> 'submitted' then
    raise exception 'Material sourcing request is not open' using errcode = '22023';
  end if;
  if p_action = 'resolved' and not exists (
    select 1 from public.materials where id = p_material_id and is_active
      and archived_at is null and material_kind = 'consumable'
  ) then raise exception 'Choose an active catalog material' using errcode = '22023'; end if;
  if p_action = 'resolved' and not exists (
    select 1 from public.inventory_balances balance
    join public.inventory_locations location on location.id = balance.inventory_location_id
    where balance.material_id = p_material_id
      and location.warehouse_id = v_row.source_warehouse_id
      and balance.available_quantity > 0
  ) then raise exception 'Material is not available in the source warehouse' using errcode = '22023'; end if;
  if p_action = 'dismissed' and p_material_id is not null then
    raise exception 'Dismissal cannot name a catalog material' using errcode = '22023';
  end if;
  update public.material_sourcing_requests
    set status = p_action, catalog_material_id = p_material_id,
      resolution_note = trim(p_note), resolved_by = auth.uid(), resolved_at = now()
    where id = p_id;
  return p_id;
end;
$$;
revoke all on function public.submit_material_sourcing_request(uuid,uuid,uuid,uuid,text,text,numeric,date,text),
  public.resolve_material_sourcing_request(uuid,text,uuid,text) from public, anon;
grant execute on function public.submit_material_sourcing_request(uuid,uuid,uuid,uuid,text,text,numeric,date,text),
  public.resolve_material_sourcing_request(uuid,text,uuid,text) to authenticated;
