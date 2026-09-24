create type public.qr_entity_type as enum ('material', 'equipment', 'vehicle', 'warehouse', 'project_site');
create type public.qr_status as enum ('active', 'inactive', 'replaced');
create type public.qr_event_type as enum ('generated', 'deactivated', 'replaced');

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  public_identifier text not null unique default ('NQ-' || upper(replace(gen_random_uuid()::text, '-', '')))
    check (public_identifier ~ '^NQ-[A-F0-9]{32}$'),
  entity_type public.qr_entity_type not null,
  material_id uuid references public.materials(id) on delete restrict,
  asset_id uuid references public.assets(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  project_site_id uuid references public.project_sites(id) on delete restrict,
  entity_id uuid generated always as (coalesce(material_id, asset_id, warehouse_id, project_site_id)) stored,
  status public.qr_status not null default 'active',
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  replaces_qr_id uuid unique references public.qr_codes(id) on delete restrict,
  remarks text check (remarks is null or char_length(trim(remarks)) between 2 and 500),
  constraint qr_entity_match check (
    (entity_type = 'material' and material_id is not null and asset_id is null and warehouse_id is null and project_site_id is null)
    or (entity_type in ('equipment', 'vehicle') and material_id is null and asset_id is not null and warehouse_id is null and project_site_id is null)
    or (entity_type = 'warehouse' and material_id is null and asset_id is null and warehouse_id is not null and project_site_id is null)
    or (entity_type = 'project_site' and material_id is null and asset_id is null and warehouse_id is null and project_site_id is not null)
  ),
  constraint qr_status_time check ((status = 'active') = (deactivated_at is null)),
  constraint qr_replacement_not_self check (replaces_qr_id is null or replaces_qr_id <> id)
);
create unique index qr_active_entity_unique on public.qr_codes (entity_type, entity_id) where status = 'active';
create index qr_entity_history_idx on public.qr_codes (entity_type, entity_id, generated_at desc);
create index qr_recent_idx on public.qr_codes (generated_at desc);

create table public.qr_events (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.qr_codes(id) on delete restrict,
  event_type public.qr_event_type not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  remarks text check (remarks is null or char_length(trim(remarks)) between 2 and 500),
  occurred_at timestamptz not null default now()
);
create index qr_events_code_idx on public.qr_events (qr_code_id, occurred_at desc);

create or replace function private.validate_qr_code()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.public_identifier, new.entity_type, new.material_id, new.asset_id, new.warehouse_id, new.project_site_id, new.generated_by, new.generated_at, new.activated_at, new.replaces_qr_id)
    is distinct from (old.public_identifier, old.entity_type, old.material_id, old.asset_id, old.warehouse_id, old.project_site_id, old.generated_by, old.generated_at, old.activated_at, old.replaces_qr_id) then
    raise exception 'QR identity is immutable' using errcode = '23514';
  end if;
  if new.asset_id is not null and not exists (
    select 1 from public.assets where id = new.asset_id and asset_kind::text = new.entity_type::text
  ) then
    raise exception 'QR asset kind does not match' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger qr_codes_validate before insert or update on public.qr_codes for each row execute function private.validate_qr_code();

create or replace function private.can_manage_qr()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) $$;

create or replace function public.ensure_qr_code(p_entity_type public.qr_entity_type, p_entity_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.can_manage_qr() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_entity_type is null or p_entity_id is null then raise exception 'entity is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entity_type::text || p_entity_id::text, 0));
  select id into v_id from public.qr_codes where entity_type = p_entity_type and entity_id = p_entity_id and status = 'active';
  if v_id is not null then return v_id; end if;
  if (p_entity_type = 'material' and not exists (select 1 from public.materials where id = p_entity_id and archived_at is null))
    or (p_entity_type in ('equipment', 'vehicle') and not exists (select 1 from public.assets where id = p_entity_id and asset_kind::text = p_entity_type::text and archived_at is null))
    or (p_entity_type = 'warehouse' and not exists (select 1 from public.warehouses where id = p_entity_id and status = 'active'))
    or (p_entity_type = 'project_site' and not exists (select 1 from public.project_sites where id = p_entity_id and status = 'active')) then
    raise exception 'entity is unavailable or incompatible' using errcode = '22023';
  end if;
  insert into public.qr_codes (entity_type, material_id, asset_id, warehouse_id, project_site_id, generated_by)
  values (p_entity_type,
    case when p_entity_type = 'material' then p_entity_id end,
    case when p_entity_type in ('equipment', 'vehicle') then p_entity_id end,
    case when p_entity_type = 'warehouse' then p_entity_id end,
    case when p_entity_type = 'project_site' then p_entity_id end,
    auth.uid()) returning id into v_id;
  insert into public.qr_events (qr_code_id, event_type, actor_id) values (v_id, 'generated', auth.uid());
  return v_id;
end;
$$;

create or replace function public.deactivate_qr_code(p_qr_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code public.qr_codes%rowtype;
begin
  if not private.can_manage_qr() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then raise exception 'reason must be 2 to 500 characters' using errcode = '22023'; end if;
  select * into v_code from public.qr_codes where id = p_qr_id for update;
  if not found or v_code.status <> 'active' then raise exception 'QR code is not active' using errcode = '22023'; end if;
  update public.qr_codes set status = 'inactive', deactivated_at = now(), remarks = trim(p_reason) where id = p_qr_id;
  insert into public.qr_events (qr_code_id, event_type, actor_id, remarks) values (p_qr_id, 'deactivated', auth.uid(), trim(p_reason));
end;
$$;

create or replace function public.replace_qr_code(p_qr_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old public.qr_codes%rowtype; v_new_id uuid;
begin
  if not private.can_manage_qr() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then raise exception 'reason must be 2 to 500 characters' using errcode = '22023'; end if;
  select * into v_old from public.qr_codes where id = p_qr_id for update;
  if not found or v_old.status <> 'active' then raise exception 'QR code is not active' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_old.entity_type::text || v_old.entity_id::text, 0));
  update public.qr_codes set status = 'replaced', deactivated_at = now(), remarks = trim(p_reason) where id = p_qr_id;
  insert into public.qr_events (qr_code_id, event_type, actor_id, remarks) values (p_qr_id, 'replaced', auth.uid(), trim(p_reason));
  insert into public.qr_codes (entity_type, material_id, asset_id, warehouse_id, project_site_id, generated_by, replaces_qr_id)
  values (v_old.entity_type, v_old.material_id, v_old.asset_id, v_old.warehouse_id, v_old.project_site_id, auth.uid(), p_qr_id)
  returning id into v_new_id;
  insert into public.qr_events (qr_code_id, event_type, actor_id, remarks) values (v_new_id, 'generated', auth.uid(), 'Replacement for ' || v_old.public_identifier);
  return v_new_id;
end;
$$;

create or replace function public.resolve_qr_code(p_identifier text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_code public.qr_codes%rowtype; v_name text; v_code_label text; v_project_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_identifier is null or p_identifier !~ '^NQ-[A-F0-9]{32}$' then raise exception 'invalid QR identifier' using errcode = '22023'; end if;
  select * into v_code from public.qr_codes where public_identifier = p_identifier and status = 'active';
  if not found then raise exception 'QR code is invalid or inactive' using errcode = '22023'; end if;
  if v_code.entity_type = 'material' then
    select name, code into v_name, v_code_label from public.materials where id = v_code.material_id and archived_at is null;
  elsif v_code.entity_type in ('equipment', 'vehicle') then
    if not private.can_view_asset(v_code.asset_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name, code into v_name, v_code_label from public.assets where id = v_code.asset_id and archived_at is null;
  elsif v_code.entity_type = 'warehouse' then
    if not private.can_access_warehouse(v_code.warehouse_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name, code into v_name, v_code_label from public.warehouses where id = v_code.warehouse_id and status = 'active';
  else
    select project_id into v_project_id from public.project_sites where id = v_code.project_site_id and status = 'active';
    if v_project_id is null or not private.can_access_project(v_project_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name into v_name from public.project_sites where id = v_code.project_site_id;
    select code into v_code_label from public.projects where id = v_project_id;
  end if;
  if v_name is null then raise exception 'QR entity is unavailable' using errcode = '22023'; end if;
  return jsonb_build_object('qr_id', v_code.id, 'identifier', v_code.public_identifier,
    'entity_type', v_code.entity_type, 'entity_id', v_code.entity_id, 'name', v_name,
    'code', v_code_label, 'project_id', v_project_id);
end;
$$;

alter table public.qr_codes enable row level security;
alter table public.qr_events enable row level security;
revoke all on table public.qr_codes, public.qr_events from anon, authenticated;
grant select on table public.qr_codes, public.qr_events to authenticated;
create policy qr_codes_manage_select on public.qr_codes for select to authenticated using (private.can_manage_qr());
create policy qr_events_manage_select on public.qr_events for select to authenticated using (private.can_manage_qr());
revoke execute on function public.ensure_qr_code(public.qr_entity_type, uuid), public.deactivate_qr_code(uuid, text), public.replace_qr_code(uuid, text), public.resolve_qr_code(text) from public, anon;
grant execute on function public.ensure_qr_code(public.qr_entity_type, uuid), public.deactivate_qr_code(uuid, text), public.replace_qr_code(uuid, text), public.resolve_qr_code(text) to authenticated;
revoke execute on function private.validate_qr_code(), private.can_manage_qr() from public, anon;
grant execute on function private.can_manage_qr() to authenticated;
