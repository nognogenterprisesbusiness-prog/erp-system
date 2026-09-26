create type public.asset_kind as enum ('equipment', 'vehicle');
create type public.asset_ownership_type as enum ('company_owned', 'rented', 'leased');
create type public.asset_status as enum ('available', 'assigned', 'in_use', 'under_maintenance', 'out_of_service', 'retired');
create type public.asset_location_kind as enum ('warehouse', 'project_site', 'maintenance_facility', 'other');
create type public.asset_event_type as enum ('registered', 'details_updated', 'status_changed', 'location_changed', 'archived');

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  asset_kind public.asset_kind not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_categories_archive_pair check ((archived_at is null) = (archived_by is null))
);
create unique index asset_categories_kind_name_unique on public.asset_categories (asset_kind, lower(name)) where archived_at is null;

create table public.asset_locations (
  id uuid primary key default gen_random_uuid(),
  location_kind public.asset_location_kind not null,
  inventory_location_id uuid unique references public.inventory_locations(id) on delete restrict,
  name text,
  address text,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_locations_source check (
    (location_kind in ('warehouse','project_site') and inventory_location_id is not null and name is null and address is null)
    or (location_kind in ('maintenance_facility','other') and inventory_location_id is null and char_length(trim(name)) between 2 and 160 and char_length(trim(address)) between 3 and 300)
  ),
  constraint asset_locations_archive_pair check ((archived_at is null) = (archived_by is null))
);
create index asset_locations_kind_idx on public.asset_locations (location_kind) where archived_at is null;
create unique index asset_locations_standalone_name_unique on public.asset_locations (location_kind, lower(name)) where inventory_location_id is null and archived_at is null;

create or replace function private.validate_asset_location_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inventory_kind text;
begin
  if new.inventory_location_id is not null then
    select location_type::text into v_inventory_kind from public.inventory_locations where id = new.inventory_location_id;
    if v_inventory_kind is null or v_inventory_kind <> new.location_kind::text then
      raise exception 'asset location type does not match the inventory location' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger asset_locations_validate_link before insert or update on public.asset_locations for each row execute function private.validate_asset_location_link();

insert into public.asset_locations (location_kind, inventory_location_id)
select location_type::text::public.asset_location_kind, id from public.inventory_locations;

create or replace function private.create_asset_location()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.asset_locations (location_kind, inventory_location_id, created_by, updated_by)
  values (new.location_type::text::public.asset_location_kind, new.id, (select auth.uid()), (select auth.uid()));
  return new;
end;
$$;
create trigger inventory_locations_create_asset_location after insert on public.inventory_locations for each row execute function private.create_asset_location();

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_kind public.asset_kind not null,
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{2,32}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  category_id uuid not null references public.asset_categories(id) on delete restrict,
  brand text not null check (char_length(trim(brand)) between 1 and 120),
  model text not null check (char_length(trim(model)) between 1 and 120),
  acquisition_date date not null,
  ownership_type public.asset_ownership_type not null,
  status public.asset_status not null default 'available',
  current_location_id uuid not null references public.asset_locations(id) on delete restrict,
  condition_notes text check (condition_notes is null or char_length(condition_notes) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_archive_pair check ((archived_at is null) = (archived_by is null)),
  constraint assets_archived_status check (archived_at is null or status = 'retired')
);
create index assets_kind_status_idx on public.assets (asset_kind, status, updated_at desc) where archived_at is null;
create index assets_location_idx on public.assets (current_location_id, status) where archived_at is null;
create index assets_category_idx on public.assets (category_id, status) where archived_at is null;
create index assets_name_idx on public.assets (name) where archived_at is null;

create table public.equipment_details (
  asset_id uuid primary key references public.assets(id) on delete restrict,
  equipment_type text not null check (char_length(trim(equipment_type)) between 2 and 120),
  serial_number text not null check (serial_number = upper(serial_number) and serial_number ~ '^[A-Z0-9./-]{2,80}$'),
  acquisition_cost numeric(18,2) not null check (acquisition_cost >= 0),
  unique (serial_number)
);

create table public.vehicle_details (
  asset_id uuid primary key references public.assets(id) on delete restrict,
  plate_number text not null check (plate_number = upper(plate_number) and plate_number ~ '^[A-Z0-9 -]{2,20}$'),
  manufacture_year smallint not null check (manufacture_year between 1886 and 2200),
  current_mileage numeric(14,2) not null default 0 check (current_mileage >= 0),
  unique (plate_number)
);

create or replace function private.enforce_asset_subtype()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_asset_id uuid; v_kind public.asset_kind; v_equipment boolean; v_vehicle boolean;
begin
  if tg_table_name = 'assets' then v_asset_id := coalesce(new.id, old.id); else v_asset_id := coalesce(new.asset_id, old.asset_id); end if;
  select asset_kind into v_kind from public.assets where id = v_asset_id;
  if v_kind is null then return null; end if;
  v_equipment := exists (select 1 from public.equipment_details where asset_id = v_asset_id);
  v_vehicle := exists (select 1 from public.vehicle_details where asset_id = v_asset_id);
  if (v_kind = 'equipment' and (not v_equipment or v_vehicle)) or (v_kind = 'vehicle' and (not v_vehicle or v_equipment)) then
    raise exception 'asset must have exactly one matching subtype record' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger assets_require_subtype after insert or update on public.assets deferrable initially deferred for each row execute function private.enforce_asset_subtype();
create constraint trigger equipment_details_match_asset after insert or update or delete on public.equipment_details deferrable initially deferred for each row execute function private.enforce_asset_subtype();
create constraint trigger vehicle_details_match_asset after insert or update or delete on public.vehicle_details deferrable initially deferred for each row execute function private.enforce_asset_subtype();

create table public.asset_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  event_type public.asset_event_type not null,
  previous_status public.asset_status,
  current_status public.asset_status,
  previous_location_id uuid references public.asset_locations(id) on delete restrict,
  current_location_id uuid references public.asset_locations(id) on delete restrict,
  summary text not null check (char_length(trim(summary)) between 2 and 500),
  details jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index asset_events_asset_idx on public.asset_events (asset_id, occurred_at desc);

create or replace function private.can_manage_assets()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['admin']::public.app_role[]) $$;

create or replace function private.can_view_asset_location(target_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_assets()
    or private.has_any_role(array['admin']::public.app_role[])
    or exists (
      select 1 from public.asset_locations al
      where al.id = target_location_id
        and al.inventory_location_id is not null
        and private.can_view_inventory_location(al.inventory_location_id)
    )
$$;

create or replace function private.can_view_asset(target_asset_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assets a
    where a.id = target_asset_id and private.can_view_asset_location(a.current_location_id)
  )
$$;

create or replace function private.validate_asset_reference(p_category_id uuid, p_kind public.asset_kind, p_location_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.asset_categories where id = p_category_id and asset_kind = p_kind and archived_at is null) then
    raise exception 'asset category is missing, archived, or incompatible' using errcode = '22023';
  end if;
  if not exists (select 1 from public.asset_locations where id = p_location_id and archived_at is null) then
    raise exception 'asset location is missing or archived' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.record_asset_event(
  p_asset_id uuid, p_event_type public.asset_event_type, p_previous_status public.asset_status,
  p_current_status public.asset_status, p_previous_location_id uuid, p_current_location_id uuid,
  p_summary text, p_details jsonb, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.asset_events (asset_id, event_type, previous_status, current_status, previous_location_id, current_location_id, summary, details, actor_id)
  values (p_asset_id, p_event_type, p_previous_status, p_current_status, p_previous_location_id, p_current_location_id, trim(p_summary), coalesce(p_details, '{}'::jsonb), p_actor);
end;
$$;

create or replace function public.save_asset_category(p_id uuid, p_asset_kind public.asset_kind, p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_name)) not between 2 and 120 then raise exception 'invalid category name' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.asset_categories (asset_kind, name, description, created_by, updated_by)
    values (p_asset_kind, trim(p_name), nullif(trim(p_description), ''), v_actor, v_actor) returning id into v_id;
  else
    update public.asset_categories set name = trim(p_name), description = nullif(trim(p_description), ''), updated_by = v_actor
    where id = p_id and asset_kind = p_asset_kind and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'category not found or kind cannot be changed' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_asset_category(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.assets where category_id = p_id and archived_at is null) then raise exception 'reassign or archive active assets before archiving this category' using errcode = '23503'; end if;
  update public.asset_categories set archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id and archived_at is null;
  if not found then raise exception 'category not found or already archived' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.save_asset_location(p_id uuid, p_location_kind public.asset_location_kind, p_name text, p_address text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_location_kind not in ('maintenance_facility','other') or char_length(trim(p_name)) not between 2 and 160 or char_length(trim(p_address)) not between 3 and 300 then
    raise exception 'invalid standalone asset location' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.asset_locations (location_kind, name, address, created_by, updated_by)
    values (p_location_kind, trim(p_name), trim(p_address), v_actor, v_actor) returning id into v_id;
  else
    update public.asset_locations set location_kind = p_location_kind, name = trim(p_name), address = trim(p_address), updated_by = v_actor
    where id = p_id and inventory_location_id is null and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'standalone asset location not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_asset_location(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.assets where current_location_id = p_id and archived_at is null) then raise exception 'move active assets before archiving this location' using errcode = '23503'; end if;
  update public.asset_locations set archived_at = now(), archived_by = v_actor, updated_by = v_actor
  where id = p_id and inventory_location_id is null and archived_at is null;
  if not found then raise exception 'standalone asset location not found or already archived' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.save_equipment(
  p_id uuid, p_code text, p_name text, p_description text, p_category_id uuid,
  p_brand text, p_model text, p_acquisition_date date, p_ownership_type public.asset_ownership_type,
  p_status public.asset_status, p_location_id uuid, p_condition_notes text,
  p_equipment_type text, p_serial_number text, p_acquisition_cost numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_old public.assets; v_event public.asset_event_type;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_status in ('assigned','in_use','retired') then raise exception 'this status is managed by assignment or archive workflows' using errcode = '22023'; end if;
  if trim(p_code) !~ '^[A-Z0-9-]{2,32}$' or char_length(trim(p_name)) not between 2 and 160 or char_length(trim(p_equipment_type)) not between 2 and 120 or trim(p_serial_number) !~ '^[A-Z0-9./-]{2,80}$' or p_acquisition_cost < 0 then raise exception 'invalid equipment values' using errcode = '22023'; end if;
  perform private.validate_asset_reference(p_category_id, 'equipment', p_location_id);
  if p_id is null then
    insert into public.assets (asset_kind, code, name, description, category_id, brand, model, acquisition_date, ownership_type, status, current_location_id, condition_notes, created_by, updated_by)
    values ('equipment', trim(p_code), trim(p_name), nullif(trim(p_description), ''), p_category_id, trim(p_brand), trim(p_model), p_acquisition_date, p_ownership_type, p_status, p_location_id, nullif(trim(p_condition_notes), ''), v_actor, v_actor)
    returning id into v_id;
    insert into public.equipment_details (asset_id, equipment_type, serial_number, acquisition_cost)
    values (v_id, trim(p_equipment_type), trim(p_serial_number), p_acquisition_cost);
    perform private.record_asset_event(v_id, 'registered', null, p_status, null, p_location_id, 'Equipment registered', jsonb_build_object('code', trim(p_code)), v_actor);
  else
    select * into v_old from public.assets where id = p_id and asset_kind = 'equipment' and archived_at is null for update;
    if v_old.id is null then raise exception 'equipment not found' using errcode = 'P0002'; end if;
    update public.assets set code = trim(p_code), name = trim(p_name), description = nullif(trim(p_description), ''), category_id = p_category_id, brand = trim(p_brand), model = trim(p_model), acquisition_date = p_acquisition_date, ownership_type = p_ownership_type, status = p_status, current_location_id = p_location_id, condition_notes = nullif(trim(p_condition_notes), ''), updated_by = v_actor where id = p_id;
    update public.equipment_details set equipment_type = trim(p_equipment_type), serial_number = trim(p_serial_number), acquisition_cost = p_acquisition_cost where asset_id = p_id;
    v_id := p_id;
    v_event := case when v_old.current_location_id <> p_location_id then 'location_changed' when v_old.status <> p_status then 'status_changed' else 'details_updated' end;
    perform private.record_asset_event(v_id, v_event, v_old.status, p_status, v_old.current_location_id, p_location_id, 'Equipment record updated', jsonb_build_object('code', trim(p_code)), v_actor);
  end if;
  return v_id;
end;
$$;

create or replace function public.save_vehicle(
  p_id uuid, p_code text, p_name text, p_description text, p_category_id uuid,
  p_brand text, p_model text, p_acquisition_date date, p_ownership_type public.asset_ownership_type,
  p_status public.asset_status, p_location_id uuid, p_condition_notes text,
  p_plate_number text, p_manufacture_year smallint, p_current_mileage numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_old public.assets; v_old_mileage numeric; v_event public.asset_event_type;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_status in ('assigned','in_use','retired') then raise exception 'this status is managed by assignment or archive workflows' using errcode = '22023'; end if;
  if trim(p_code) !~ '^[A-Z0-9-]{2,32}$' or char_length(trim(p_name)) not between 2 and 160 or trim(p_plate_number) !~ '^[A-Z0-9 -]{2,20}$' or p_manufacture_year not between 1886 and extract(year from current_date)::smallint + 1 or p_current_mileage < 0 then raise exception 'invalid vehicle values' using errcode = '22023'; end if;
  perform private.validate_asset_reference(p_category_id, 'vehicle', p_location_id);
  if p_id is null then
    insert into public.assets (asset_kind, code, name, description, category_id, brand, model, acquisition_date, ownership_type, status, current_location_id, condition_notes, created_by, updated_by)
    values ('vehicle', trim(p_code), trim(p_name), nullif(trim(p_description), ''), p_category_id, trim(p_brand), trim(p_model), p_acquisition_date, p_ownership_type, p_status, p_location_id, nullif(trim(p_condition_notes), ''), v_actor, v_actor)
    returning id into v_id;
    insert into public.vehicle_details (asset_id, plate_number, manufacture_year, current_mileage)
    values (v_id, trim(p_plate_number), p_manufacture_year, p_current_mileage);
    perform private.record_asset_event(v_id, 'registered', null, p_status, null, p_location_id, 'Vehicle registered', jsonb_build_object('code', trim(p_code)), v_actor);
  else
    select * into v_old from public.assets where id = p_id and asset_kind = 'vehicle' and archived_at is null for update;
    if v_old.id is null then raise exception 'vehicle not found' using errcode = 'P0002'; end if;
    select current_mileage into v_old_mileage from public.vehicle_details where asset_id = p_id for update;
    if p_current_mileage < v_old_mileage then raise exception 'vehicle mileage cannot decrease' using errcode = '22023'; end if;
    update public.assets set code = trim(p_code), name = trim(p_name), description = nullif(trim(p_description), ''), category_id = p_category_id, brand = trim(p_brand), model = trim(p_model), acquisition_date = p_acquisition_date, ownership_type = p_ownership_type, status = p_status, current_location_id = p_location_id, condition_notes = nullif(trim(p_condition_notes), ''), updated_by = v_actor where id = p_id;
    update public.vehicle_details set plate_number = trim(p_plate_number), manufacture_year = p_manufacture_year, current_mileage = p_current_mileage where asset_id = p_id;
    v_id := p_id;
    v_event := case when v_old.current_location_id <> p_location_id then 'location_changed' when v_old.status <> p_status then 'status_changed' else 'details_updated' end;
    perform private.record_asset_event(v_id, v_event, v_old.status, p_status, v_old.current_location_id, p_location_id, 'Vehicle record updated', jsonb_build_object('code', trim(p_code), 'previous_mileage', v_old_mileage, 'current_mileage', p_current_mileage), v_actor);
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_asset(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old public.assets;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'archive reason is required' using errcode = '22023'; end if;
  select * into v_old from public.assets where id = p_id and archived_at is null for update;
  if v_old.id is null then raise exception 'asset not found or already archived' using errcode = 'P0002'; end if;
  if v_old.status in ('assigned','in_use') then raise exception 'an assigned or in-use asset cannot be archived' using errcode = '22023'; end if;
  update public.assets set status = 'retired', archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id;
  perform private.record_asset_event(p_id, 'archived', v_old.status, 'retired', v_old.current_location_id, v_old.current_location_id, trim(p_reason), '{}'::jsonb, v_actor);
end;
$$;

create trigger asset_categories_set_updated_at before update on public.asset_categories for each row execute function private.set_updated_at();
create trigger asset_locations_set_updated_at before update on public.asset_locations for each row execute function private.set_updated_at();
create trigger assets_set_updated_at before update on public.assets for each row execute function private.set_updated_at();
create or replace function private.audit_asset_detail_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := case when tg_op = 'DELETE' then old.asset_id else new.asset_id end;
  insert into public.audit_logs (actor_id, table_name, record_id, action, old_data, new_data)
  values (
    (select auth.uid()), tg_table_name, target_id, lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger asset_categories_audit after insert or update or delete on public.asset_categories for each row execute function private.audit_row_change();
create trigger asset_locations_audit after insert or update or delete on public.asset_locations for each row execute function private.audit_row_change();
create trigger assets_audit after insert or update or delete on public.assets for each row execute function private.audit_row_change();
create trigger equipment_details_audit after insert or update or delete on public.equipment_details for each row execute function private.audit_asset_detail_change();
create trigger vehicle_details_audit after insert or update or delete on public.vehicle_details for each row execute function private.audit_asset_detail_change();
create trigger asset_events_audit after insert on public.asset_events for each row execute function private.audit_row_change();

alter table public.asset_categories enable row level security;
alter table public.asset_locations enable row level security;
alter table public.assets enable row level security;
alter table public.equipment_details enable row level security;
alter table public.vehicle_details enable row level security;
alter table public.asset_events enable row level security;

revoke all on table public.asset_categories, public.asset_locations, public.assets, public.equipment_details, public.vehicle_details, public.asset_events from anon, authenticated;
grant select on table public.asset_categories, public.asset_locations, public.assets, public.equipment_details, public.vehicle_details, public.asset_events to authenticated;

create policy asset_categories_select_authenticated on public.asset_categories for select to authenticated using (true);
create policy asset_locations_select_authorized on public.asset_locations for select to authenticated using (private.can_view_asset_location(id));
create policy assets_select_authorized on public.assets for select to authenticated using (private.can_view_asset_location(current_location_id));
create policy equipment_details_select_authorized on public.equipment_details for select to authenticated using (private.can_view_asset(asset_id));
create policy vehicle_details_select_authorized on public.vehicle_details for select to authenticated using (private.can_view_asset(asset_id));
create policy asset_events_select_authorized on public.asset_events for select to authenticated using (private.can_view_asset(asset_id));

revoke execute on function private.validate_asset_location_link(), private.create_asset_location(), private.enforce_asset_subtype(), private.audit_asset_detail_change(), private.can_manage_assets(), private.can_view_asset_location(uuid), private.can_view_asset(uuid), private.validate_asset_reference(uuid, public.asset_kind, uuid), private.record_asset_event(uuid, public.asset_event_type, public.asset_status, public.asset_status, uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function private.can_view_asset_location(uuid), private.can_view_asset(uuid) to authenticated;

revoke execute on function public.save_asset_category(uuid, public.asset_kind, text, text), public.archive_asset_category(uuid), public.save_asset_location(uuid, public.asset_location_kind, text, text), public.archive_asset_location(uuid), public.save_equipment(uuid, text, text, text, uuid, text, text, date, public.asset_ownership_type, public.asset_status, uuid, text, text, text, numeric), public.save_vehicle(uuid, text, text, text, uuid, text, text, date, public.asset_ownership_type, public.asset_status, uuid, text, text, smallint, numeric), public.archive_asset(uuid, text) from public, anon;
grant execute on function public.save_asset_category(uuid, public.asset_kind, text, text), public.archive_asset_category(uuid), public.save_asset_location(uuid, public.asset_location_kind, text, text), public.archive_asset_location(uuid), public.save_equipment(uuid, text, text, text, uuid, text, text, date, public.asset_ownership_type, public.asset_status, uuid, text, text, text, numeric), public.save_vehicle(uuid, text, text, text, uuid, text, text, date, public.asset_ownership_type, public.asset_status, uuid, text, text, smallint, numeric), public.archive_asset(uuid, text) to authenticated;
