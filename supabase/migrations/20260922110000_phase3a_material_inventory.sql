create type public.material_kind as enum ('consumable', 'reusable');
create type public.uom_dimension as enum ('count', 'mass', 'volume', 'length', 'area');
create type public.inventory_transaction_type as enum ('OPENING_BALANCE', 'STOCK_IN', 'STOCK_OUT', 'WAREHOUSE_TRANSFER', 'SITE_TRANSFER', 'MATERIAL_CONSUMPTION', 'MATERIAL_RETURN', 'INVENTORY_ADJUSTMENT', 'REVERSAL');
create type public.transfer_status as enum ('dispatched', 'partially_received', 'received', 'cancelled');
create type public.transfer_phase as enum ('dispatch', 'receipt');

create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{1,16}$'),
  name text not null unique check (char_length(trim(name)) between 1 and 80),
  symbol text not null check (char_length(trim(symbol)) between 1 and 16),
  dimension public.uom_dimension not null,
  decimal_scale smallint not null default 4 check (decimal_scale between 0 and 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.units_of_measure (code, name, symbol, dimension, decimal_scale) values
  ('BAG', 'Bag', 'bag', 'count', 2),
  ('PC', 'Piece', 'pc', 'count', 0),
  ('KG', 'Kilogram', 'kg', 'mass', 4),
  ('L', 'Liter', 'L', 'volume', 4),
  ('M', 'Meter', 'm', 'length', 4),
  ('M2', 'Square Meter', 'm²', 'area', 4),
  ('M3', 'Cubic Meter', 'm³', 'volume', 4);

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_categories_archive_pair check ((archived_at is null) = (archived_by is null))
);
create unique index material_categories_name_unique on public.material_categories (lower(name)) where archived_at is null;

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9-]{2,32}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  category_id uuid not null references public.material_categories(id) on delete restrict,
  base_unit_id uuid not null references public.units_of_measure(id) on delete restrict,
  material_kind public.material_kind not null default 'consumable',
  minimum_stock_level numeric(20,4) not null default 0 check (minimum_stock_level >= 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_archive_pair check ((archived_at is null) = (archived_by is null))
);
create unique index materials_code_unique on public.materials (code);
create index materials_category_idx on public.materials (category_id) where archived_at is null;
create index materials_name_idx on public.materials (name) where archived_at is null;

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity_on_hand numeric(20,4) not null default 0 check (quantity_on_hand >= 0),
  reserved_quantity numeric(20,4) not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity_on_hand),
  available_quantity numeric(20,4) generated always as (quantity_on_hand - reserved_quantity) stored,
  updated_at timestamptz not null default now(),
  unique (material_id, inventory_location_id)
);
create index inventory_balances_location_idx on public.inventory_balances (inventory_location_id, material_id);
create index inventory_balances_material_idx on public.inventory_balances (material_id, inventory_location_id);

create sequence public.inventory_transfer_number_seq;
create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique default ('TRF-' || lpad(nextval('public.inventory_transfer_number_seq')::text, 8, '0')),
  source_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  destination_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  external_reference text not null check (char_length(trim(external_reference)) between 2 and 120),
  status public.transfer_status not null default 'dispatched',
  dispatched_by uuid not null references public.profiles(id) on delete restrict,
  dispatched_at timestamptz not null,
  received_by uuid references public.profiles(id) on delete restrict,
  received_at timestamptz,
  remarks text check (remarks is null or char_length(remarks) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_location_id <> destination_location_id),
  constraint inventory_transfers_receipt_pair check ((received_at is null) = (received_by is null))
);
create index inventory_transfers_status_idx on public.inventory_transfers (status, created_at desc);
create index inventory_transfers_source_idx on public.inventory_transfers (source_location_id, created_at desc);
create index inventory_transfers_destination_idx on public.inventory_transfers (destination_location_id, created_at desc);

create table public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  dispatched_quantity numeric(20,4) not null check (dispatched_quantity > 0),
  received_quantity numeric(20,4) not null default 0 check (received_quantity >= 0 and received_quantity <= dispatched_quantity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transfer_id, material_id)
);
create index inventory_transfer_items_transfer_idx on public.inventory_transfer_items (transfer_id);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(20,4) not null check (quantity > 0),
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  source_location_id uuid references public.inventory_locations(id) on delete restrict,
  destination_location_id uuid references public.inventory_locations(id) on delete restrict,
  transaction_type public.inventory_transaction_type not null,
  transfer_id uuid references public.inventory_transfers(id) on delete restrict,
  transfer_item_id uuid references public.inventory_transfer_items(id) on delete restrict,
  transfer_phase public.transfer_phase,
  reference_document text not null check (char_length(trim(reference_document)) between 2 and 120),
  project_id uuid references public.projects(id) on delete restrict,
  responsible_user_id uuid not null references public.profiles(id) on delete restrict,
  transaction_date date not null,
  remarks text check (remarks is null or char_length(remarks) <= 2000),
  reversal_of uuid unique references public.inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_transaction_location check (source_location_id is not null or destination_location_id is not null),
  constraint inventory_transaction_transfer_fields check ((transfer_id is null and transfer_item_id is null and transfer_phase is null) or (transfer_id is not null and transfer_item_id is not null and transfer_phase is not null))
);
create index inventory_transactions_material_idx on public.inventory_transactions (material_id, transaction_date desc, created_at desc);
create index inventory_transactions_source_idx on public.inventory_transactions (source_location_id, transaction_date desc) where source_location_id is not null;
create index inventory_transactions_destination_idx on public.inventory_transactions (destination_location_id, transaction_date desc) where destination_location_id is not null;
create index inventory_transactions_project_idx on public.inventory_transactions (project_id, transaction_date desc) where project_id is not null;

create table public.inventory_command_receipts (
  idempotency_key uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  command_name text not null,
  result_id uuid not null,
  created_at timestamptz not null default now()
);

create or replace function private.can_manage_inventory()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) $$;

create or replace function private.can_view_inventory_location(target_location_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_manage_inventory()
    or private.has_any_role(array['accounting']::public.app_role[])
    or exists (
    select 1 from public.inventory_locations il
    where il.id = target_location_id and (
      (il.warehouse_id is not null and private.can_access_warehouse(il.warehouse_id))
      or (il.project_site_id is not null and exists (
        select 1 from public.project_sites ps where ps.id = il.project_site_id and private.can_access_project(ps.project_id)
      ))
    )
  )
$$;

create or replace function private.can_operate_inventory_location(target_location_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_manage_inventory() or exists (
    select 1 from public.inventory_locations il
    join public.warehouse_assignments wa on wa.warehouse_id = il.warehouse_id
    join public.profiles p on p.id = wa.user_id and p.is_active
    where il.id = target_location_id and wa.user_id = (select auth.uid()) and wa.status = 'active'
  )
$$;

create or replace function private.validate_inventory_material(p_material_id uuid, p_unit_id uuid)
returns public.material_kind language plpgsql stable security definer set search_path = ''
as $$
declare v_kind public.material_kind;
begin
  select material_kind into v_kind from public.materials
  where id = p_material_id and is_active and archived_at is null and base_unit_id = p_unit_id;
  if v_kind is null then raise exception 'material is inactive, archived, missing, or uses a different unit' using errcode = '22023'; end if;
  if v_kind = 'reusable' then raise exception 'reusable items require the dedicated custody workflow' using errcode = '0A000'; end if;
  return v_kind;
end;
$$;

create or replace function private.validate_inventory_quantity(p_quantity numeric, p_unit_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare v_scale smallint;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive' using errcode = '22023'; end if;
  select decimal_scale into v_scale from public.units_of_measure where id = p_unit_id and is_active;
  if v_scale is null then raise exception 'unit not found or inactive' using errcode = '22023'; end if;
  if p_quantity <> round(p_quantity, v_scale) then raise exception 'quantity exceeds the unit precision' using errcode = '22023'; end if;
end;
$$;

create or replace function private.existing_inventory_command(p_key uuid, p_command text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_receipt public.inventory_command_receipts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into v_receipt from public.inventory_command_receipts where idempotency_key = p_key;
  if v_receipt.idempotency_key is null then return null; end if;
  if v_receipt.actor_id <> p_actor or v_receipt.command_name <> p_command then raise exception 'idempotency key was already used for another command' using errcode = '23505'; end if;
  return v_receipt.result_id;
end;
$$;

create or replace function public.post_stock_in(
  p_idempotency_key uuid, p_material_id uuid, p_destination_location_id uuid, p_quantity numeric,
  p_unit_id uuid, p_reference_document text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_existing uuid; v_transaction_id uuid := gen_random_uuid();
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'post_stock_in', v_actor); if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not private.can_operate_inventory_location(p_destination_location_id) or not exists (select 1 from public.inventory_locations where id = p_destination_location_id and warehouse_id is not null) then raise exception 'not authorized for destination warehouse' using errcode = '42501'; end if;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand)
  values (p_material_id, p_destination_location_id, p_quantity)
  on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, destination_location_id, transaction_type, reference_document, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, p_material_id, p_quantity, p_unit_id, p_destination_location_id, 'STOCK_IN', trim(p_reference_document), v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'post_stock_in', v_transaction_id, now());
  return v_transaction_id;
end; $$;

create or replace function public.post_stock_out(
  p_idempotency_key uuid, p_material_id uuid, p_source_location_id uuid, p_quantity numeric,
  p_unit_id uuid, p_reference_document text, p_transaction_date date, p_project_id uuid default null, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_existing uuid; v_transaction_id uuid := gen_random_uuid(); v_available numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'post_stock_out', v_actor); if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not private.can_operate_inventory_location(p_source_location_id) or not exists (select 1 from public.inventory_locations where id = p_source_location_id and warehouse_id is not null) then raise exception 'not authorized for source warehouse' using errcode = '42501'; end if;
  if p_project_id is not null and not private.can_access_project(p_project_id) then raise exception 'not authorized for project' using errcode = '42501'; end if;
  select available_quantity into v_available from public.inventory_balances where material_id = p_material_id and inventory_location_id = p_source_location_id for update;
  if coalesce(v_available, 0) < p_quantity then raise exception 'insufficient available stock' using errcode = 'P0001'; end if;
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now() where material_id = p_material_id and inventory_location_id = p_source_location_id;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type, reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, p_material_id, p_quantity, p_unit_id, p_source_location_id, 'STOCK_OUT', trim(p_reference_document), p_project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'post_stock_out', v_transaction_id, now());
  return v_transaction_id;
end; $$;

create or replace function public.dispatch_inventory_transfer(
  p_idempotency_key uuid, p_material_id uuid, p_source_location_id uuid, p_destination_location_id uuid,
  p_quantity numeric, p_unit_id uuid, p_external_reference text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_existing uuid; v_transfer_id uuid := gen_random_uuid(); v_item_id uuid := gen_random_uuid(); v_transaction_id uuid := gen_random_uuid(); v_available numeric; v_type public.inventory_transaction_type; v_destination_site boolean;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_source_location_id = p_destination_location_id then raise exception 'source and destination must be different' using errcode = '22023'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'dispatch_inventory_transfer', v_actor); if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not private.can_operate_inventory_location(p_source_location_id) then raise exception 'not authorized for source location' using errcode = '42501'; end if;
  select project_site_id is not null into v_destination_site from public.inventory_locations where id = p_destination_location_id;
  if v_destination_site is null then raise exception 'destination location not found' using errcode = 'P0002'; end if;
  if v_destination_site and not private.can_manage_inventory() then raise exception 'direct site dispatch requires an administrator until the request workflow is approved' using errcode = '42501'; end if;
  select available_quantity into v_available from public.inventory_balances where material_id = p_material_id and inventory_location_id = p_source_location_id for update;
  if coalesce(v_available, 0) < p_quantity then raise exception 'insufficient available stock' using errcode = 'P0001'; end if;
  v_type := case when exists (select 1 from public.inventory_locations where id = p_source_location_id and project_site_id is not null)
    then 'MATERIAL_RETURN'::public.inventory_transaction_type
    when v_destination_site then 'SITE_TRANSFER'::public.inventory_transaction_type
    else 'WAREHOUSE_TRANSFER'::public.inventory_transaction_type end;
  insert into public.inventory_transfers (id, source_location_id, destination_location_id, external_reference, dispatched_by, dispatched_at, remarks) values (v_transfer_id, p_source_location_id, p_destination_location_id, trim(p_external_reference), v_actor, p_transaction_date::timestamptz, nullif(trim(p_remarks), ''));
  insert into public.inventory_transfer_items (id, transfer_id, material_id, unit_of_measure_id, dispatched_quantity) values (v_item_id, v_transfer_id, p_material_id, p_unit_id, p_quantity);
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now() where material_id = p_material_id and inventory_location_id = p_source_location_id;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id, transfer_phase, reference_document, responsible_user_id, transaction_date, remarks)
  select v_transaction_id, p_material_id, p_quantity, p_unit_id, p_source_location_id, p_destination_location_id, v_type, v_transfer_id, v_item_id, 'dispatch', transfer_number, v_actor, p_transaction_date, nullif(trim(p_remarks), '') from public.inventory_transfers where id = v_transfer_id;
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'dispatch_inventory_transfer', v_transfer_id, now());
  return v_transfer_id;
end; $$;

create or replace function public.receive_inventory_transfer(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_existing uuid; v_transaction_id uuid := gen_random_uuid(); v_item public.inventory_transfer_items; v_transfer public.inventory_transfers; v_total_dispatched numeric; v_total_received numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'receive_inventory_transfer', v_actor); if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null then raise exception 'transfer item not found' using errcode = 'P0002'; end if;
  perform private.validate_inventory_quantity(p_quantity, v_item.unit_of_measure_id);
  select * into v_transfer from public.inventory_transfers where id = v_item.transfer_id for update;
  if v_transfer.status in ('received', 'cancelled') then raise exception 'transfer is not receivable' using errcode = '22023'; end if;
  if not private.can_manage_inventory() and not private.can_operate_inventory_location(v_transfer.destination_location_id) then raise exception 'not authorized for destination location' using errcode = '42501'; end if;
  if v_item.received_quantity + p_quantity > v_item.dispatched_quantity then raise exception 'received quantity exceeds remaining in-transit quantity' using errcode = '22023'; end if;
  update public.inventory_transfer_items set received_quantity = received_quantity + p_quantity, updated_at = now() where id = v_item.id;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values (v_item.material_id, v_transfer.destination_location_id, p_quantity)
  on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id, transfer_phase, reference_document, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, v_item.material_id, p_quantity, v_item.unit_of_measure_id, v_transfer.source_location_id, v_transfer.destination_location_id, case
    when exists (select 1 from public.inventory_locations where id = v_transfer.source_location_id and project_site_id is not null) then 'MATERIAL_RETURN'::public.inventory_transaction_type
    when exists (select 1 from public.inventory_locations where id = v_transfer.destination_location_id and project_site_id is not null) then 'SITE_TRANSFER'::public.inventory_transaction_type
    else 'WAREHOUSE_TRANSFER'::public.inventory_transaction_type end, v_transfer.id, v_item.id, 'receipt', v_transfer.transfer_number, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  select sum(dispatched_quantity), sum(received_quantity) into v_total_dispatched, v_total_received from public.inventory_transfer_items where transfer_id = v_transfer.id;
  update public.inventory_transfers set status = case when v_total_received = v_total_dispatched then 'received' else 'partially_received' end, received_by = case when v_total_received = v_total_dispatched then v_actor else null end, received_at = case when v_total_received = v_total_dispatched then p_transaction_date::timestamptz else null end, updated_at = now() where id = v_transfer.id;
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'receive_inventory_transfer', v_transaction_id, now());
  return v_transaction_id;
end; $$;

create or replace function public.save_material_category(p_id uuid, p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_inventory() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_name)) not between 2 and 120 then raise exception 'invalid category name' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.material_categories (name, description, created_by, updated_by) values (trim(p_name), nullif(trim(p_description), ''), v_actor, v_actor) returning id into v_id;
  else
    update public.material_categories set name = trim(p_name), description = nullif(trim(p_description), ''), updated_by = v_actor where id = p_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'category not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.archive_material_category(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_inventory() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.materials where category_id = p_id and archived_at is null) then raise exception 'archive or reassign active materials before archiving this category' using errcode = '23503'; end if;
  update public.material_categories set archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id and archived_at is null;
  if not found then raise exception 'category not found or already archived' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.save_material(
  p_id uuid, p_code text, p_name text, p_description text, p_category_id uuid, p_base_unit_id uuid,
  p_material_kind public.material_kind, p_minimum_stock_level numeric, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_inventory() then raise exception 'not authorized' using errcode = '42501'; end if;
  if trim(p_code) !~ '^[A-Z0-9-]{2,32}$' or char_length(trim(p_name)) not between 2 and 160 or p_minimum_stock_level < 0 then raise exception 'invalid material values' using errcode = '22023'; end if;
  if not exists (select 1 from public.material_categories where id = p_category_id and archived_at is null) then raise exception 'category not found or archived' using errcode = '22023'; end if;
  if not exists (select 1 from public.units_of_measure where id = p_base_unit_id and is_active) then raise exception 'unit not found or inactive' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.materials (code, name, description, category_id, base_unit_id, material_kind, minimum_stock_level, is_active, created_by, updated_by)
    values (trim(p_code), trim(p_name), nullif(trim(p_description), ''), p_category_id, p_base_unit_id, p_material_kind, p_minimum_stock_level, p_is_active, v_actor, v_actor) returning id into v_id;
  else
    if exists (
      select 1 from public.materials m
      where m.id = p_id and (m.base_unit_id <> p_base_unit_id or m.material_kind <> p_material_kind)
        and (exists (select 1 from public.inventory_transactions t where t.material_id = m.id)
          or exists (select 1 from public.inventory_balances b where b.material_id = m.id))
    ) then raise exception 'unit and material type cannot change after inventory history exists' using errcode = '22023'; end if;
    update public.materials set code = trim(p_code), name = trim(p_name), description = nullif(trim(p_description), ''), category_id = p_category_id, base_unit_id = p_base_unit_id, material_kind = p_material_kind, minimum_stock_level = p_minimum_stock_level, is_active = p_is_active, updated_by = v_actor
    where id = p_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'material not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.archive_material(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_inventory() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.inventory_balances where material_id = p_id and (quantity_on_hand <> 0 or reserved_quantity <> 0)) then raise exception 'material with stock cannot be archived' using errcode = '22023'; end if;
  if exists (select 1 from public.inventory_transfer_items where material_id = p_id and dispatched_quantity > received_quantity) then raise exception 'material with stock in transit cannot be archived' using errcode = '22023'; end if;
  update public.materials set is_active = false, archived_at = now(), archived_by = v_actor, updated_by = v_actor where id = p_id and archived_at is null;
  if not found then raise exception 'material not found or already archived' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.reverse_inventory_transaction(p_idempotency_key uuid, p_transaction_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_existing uuid; v_reversal_id uuid := gen_random_uuid(); v_original public.inventory_transactions; v_available numeric; v_item public.inventory_transfer_items; v_dispatched numeric; v_received numeric;
begin
  if v_actor is null or not private.can_manage_inventory() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'reversal reason is required' using errcode = '22023'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'reverse_inventory_transaction', v_actor); if v_existing is not null then return v_existing; end if;
  select * into v_original from public.inventory_transactions where id = p_transaction_id for update;
  if v_original.id is null or v_original.transaction_type = 'REVERSAL' or exists (select 1 from public.inventory_transactions where reversal_of = p_transaction_id) then raise exception 'transaction is not reversible' using errcode = '22023'; end if;

  if v_original.transaction_type in ('STOCK_IN', 'OPENING_BALANCE') or v_original.transfer_phase = 'receipt' then
    select available_quantity into v_available from public.inventory_balances where material_id = v_original.material_id and inventory_location_id = v_original.destination_location_id for update;
    if coalesce(v_available, 0) < v_original.quantity then raise exception 'reversal would create negative or reserved stock' using errcode = 'P0001'; end if;
    update public.inventory_balances set quantity_on_hand = quantity_on_hand - v_original.quantity, updated_at = now() where material_id = v_original.material_id and inventory_location_id = v_original.destination_location_id;
  elsif v_original.transaction_type = 'STOCK_OUT' or v_original.transfer_phase = 'dispatch' then
    insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values (v_original.material_id, v_original.source_location_id, v_original.quantity)
    on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  else
    raise exception 'this transaction type requires its phase-specific reversal workflow' using errcode = '0A000';
  end if;

  if v_original.transfer_item_id is not null then
    select * into v_item from public.inventory_transfer_items where id = v_original.transfer_item_id for update;
    if v_original.transfer_phase = 'dispatch' then
      if v_item.received_quantity > 0 then raise exception 'cannot reverse a dispatch after receipt has begun' using errcode = '22023'; end if;
      update public.inventory_transfers set status = 'cancelled', updated_at = now() where id = v_original.transfer_id;
    else
      update public.inventory_transfer_items set received_quantity = received_quantity - v_original.quantity, updated_at = now() where id = v_item.id;
      select sum(dispatched_quantity), sum(received_quantity) into v_dispatched, v_received from public.inventory_transfer_items where transfer_id = v_original.transfer_id;
      update public.inventory_transfers set status = case when v_received = 0 then 'dispatched' when v_received < v_dispatched then 'partially_received' else 'received' end, received_by = case when v_received = v_dispatched then received_by else null end, received_at = case when v_received = v_dispatched then received_at else null end, updated_at = now() where id = v_original.transfer_id;
    end if;
  end if;

  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, destination_location_id, transaction_type, reference_document, project_id, responsible_user_id, transaction_date, remarks, reversal_of)
  values (
    v_reversal_id, v_original.material_id, v_original.quantity, v_original.unit_of_measure_id,
    case when v_original.transaction_type in ('STOCK_IN', 'OPENING_BALANCE') or v_original.transfer_phase = 'receipt' then v_original.destination_location_id else null end,
    case when v_original.transaction_type = 'STOCK_OUT' or v_original.transfer_phase = 'dispatch' then v_original.source_location_id else null end,
    'REVERSAL', left('REV-' || v_original.reference_document, 120), v_original.project_id, v_actor, current_date, trim(p_reason), v_original.id
  );
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'reverse_inventory_transaction', v_reversal_id, now());
  return v_reversal_id;
end; $$;

create trigger material_categories_set_updated_at before update on public.material_categories for each row execute function private.set_updated_at();
create trigger materials_set_updated_at before update on public.materials for each row execute function private.set_updated_at();
create trigger inventory_balances_set_updated_at before update on public.inventory_balances for each row execute function private.set_updated_at();
create trigger inventory_transfers_set_updated_at before update on public.inventory_transfers for each row execute function private.set_updated_at();
create trigger inventory_transfer_items_set_updated_at before update on public.inventory_transfer_items for each row execute function private.set_updated_at();
create trigger material_categories_audit after insert or update or delete on public.material_categories for each row execute function private.audit_row_change();
create trigger materials_audit after insert or update or delete on public.materials for each row execute function private.audit_row_change();
create trigger inventory_transfers_audit after insert or update or delete on public.inventory_transfers for each row execute function private.audit_row_change();
create trigger inventory_transactions_audit after insert on public.inventory_transactions for each row execute function private.audit_row_change();

alter table public.units_of_measure enable row level security;
alter table public.material_categories enable row level security;
alter table public.materials enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_command_receipts enable row level security;

revoke all on table public.units_of_measure, public.material_categories, public.materials, public.inventory_balances, public.inventory_transfers, public.inventory_transfer_items, public.inventory_transactions, public.inventory_command_receipts from anon, authenticated;
grant select on table public.units_of_measure, public.inventory_balances, public.inventory_transfers, public.inventory_transfer_items, public.inventory_transactions to authenticated;
grant select on table public.material_categories, public.materials to authenticated;

create policy units_select_authenticated on public.units_of_measure for select to authenticated using (true);
create policy categories_select_authenticated on public.material_categories for select to authenticated using (true);
create policy categories_insert_admin on public.material_categories for insert to authenticated with check (private.can_manage_inventory() and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy categories_update_admin on public.material_categories for update to authenticated using (private.can_manage_inventory()) with check (private.can_manage_inventory() and updated_by = (select auth.uid()));
create policy materials_select_authenticated on public.materials for select to authenticated using (true);
create policy materials_insert_admin on public.materials for insert to authenticated with check (private.can_manage_inventory() and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy materials_update_admin on public.materials for update to authenticated using (private.can_manage_inventory()) with check (private.can_manage_inventory() and updated_by = (select auth.uid()));
create policy balances_select_authorized on public.inventory_balances for select to authenticated using (private.can_view_inventory_location(inventory_location_id));
create policy transfers_select_authorized on public.inventory_transfers for select to authenticated using (private.can_view_inventory_location(source_location_id) or private.can_view_inventory_location(destination_location_id));
create policy transfer_items_select_authorized on public.inventory_transfer_items for select to authenticated using (exists (select 1 from public.inventory_transfers t where t.id = transfer_id and (private.can_view_inventory_location(t.source_location_id) or private.can_view_inventory_location(t.destination_location_id))));
create policy transactions_select_authorized on public.inventory_transactions for select to authenticated using ((source_location_id is not null and private.can_view_inventory_location(source_location_id)) or (destination_location_id is not null and private.can_view_inventory_location(destination_location_id)));
create policy inventory_locations_select_accounting on public.inventory_locations for select to authenticated using (private.has_any_role(array['accounting']::public.app_role[]));
create policy warehouses_select_accounting_inventory on public.warehouses for select to authenticated using (private.has_any_role(array['accounting']::public.app_role[]));
create policy project_sites_select_accounting_inventory on public.project_sites for select to authenticated using (private.has_any_role(array['accounting']::public.app_role[]));
create policy projects_select_accounting_inventory on public.projects for select to authenticated using (private.has_any_role(array['accounting']::public.app_role[]));

revoke execute on function private.can_manage_inventory(), private.can_view_inventory_location(uuid), private.can_operate_inventory_location(uuid), private.validate_inventory_material(uuid, uuid), private.validate_inventory_quantity(numeric, uuid), private.existing_inventory_command(uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.can_view_inventory_location(uuid) to authenticated;
revoke execute on function public.post_stock_in(uuid, uuid, uuid, numeric, uuid, text, date, text), public.post_stock_out(uuid, uuid, uuid, numeric, uuid, text, date, uuid, text), public.dispatch_inventory_transfer(uuid, uuid, uuid, uuid, numeric, uuid, text, date, text), public.receive_inventory_transfer(uuid, uuid, numeric, date, text), public.save_material_category(uuid, text, text), public.archive_material_category(uuid), public.save_material(uuid, text, text, text, uuid, uuid, public.material_kind, numeric, boolean), public.archive_material(uuid), public.reverse_inventory_transaction(uuid, uuid, text) from public, anon;
grant execute on function public.post_stock_in(uuid, uuid, uuid, numeric, uuid, text, date, text), public.post_stock_out(uuid, uuid, uuid, numeric, uuid, text, date, uuid, text), public.dispatch_inventory_transfer(uuid, uuid, uuid, uuid, numeric, uuid, text, date, text), public.receive_inventory_transfer(uuid, uuid, numeric, date, text), public.save_material_category(uuid, text, text), public.archive_material_category(uuid), public.save_material(uuid, text, text, text, uuid, uuid, public.material_kind, numeric, boolean), public.archive_material(uuid), public.reverse_inventory_transaction(uuid, uuid, text) to authenticated;
