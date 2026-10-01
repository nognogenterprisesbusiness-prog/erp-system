-- Minimal copy of the production inventory schema needed by the valuation trigger.
create role anon; create role authenticated;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;
create type public.app_role as enum ('admin','engineer','foreman','warehouse_staff','finance');
create type public.inventory_transaction_type as enum ('OPENING_BALANCE','STOCK_IN','STOCK_OUT','WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN','MATERIAL_CONSUMPTION','REVERSAL');
create type public.transfer_phase as enum ('dispatch','receipt');
create type public.transfer_status as enum ('dispatched','partially_received','received','cancelled');
create type public.inventory_location_type as enum ('warehouse','project_site');
create function private.can_manage_inventory() returns boolean language sql as $$ select true $$;
create function private.can_manage_projects() returns boolean language sql as $$ select true $$;
create function private.has_any_role(r public.app_role[]) returns boolean language sql as $$ select true $$;
create function private.validate_inventory_quantity(q numeric, u uuid) returns void language plpgsql as $$ begin if q <= 0 then raise exception 'bad qty'; end if; end $$;

create table public.profiles (id uuid primary key);
insert into public.profiles values ('00000000-0000-0000-0000-0000000000aa');
create table public.units_of_measure (id uuid primary key);
insert into public.units_of_measure values ('00000000-0000-0000-0000-0000000000b1');
create table public.materials (id uuid primary key, base_unit_id uuid);
create table public.warehouses (id uuid primary key, name text not null);
create table public.projects (id uuid primary key);
create table public.project_sites (id uuid primary key, project_id uuid, name text not null);
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(), location_type public.inventory_location_type not null,
  warehouse_id uuid unique references public.warehouses(id), project_site_id uuid unique references public.project_sites(id));
create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id), inventory_location_id uuid not null references public.inventory_locations(id),
  quantity_on_hand numeric(20,4) not null default 0 check (quantity_on_hand >= 0),
  reserved_quantity numeric(20,4) not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity_on_hand),
  available_quantity numeric(20,4) generated always as (quantity_on_hand - reserved_quantity) stored,
  updated_at timestamptz not null default now(), unique (material_id, inventory_location_id));
create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(), transfer_number text not null,
  source_location_id uuid not null, destination_location_id uuid not null,
  status public.transfer_status not null default 'dispatched', received_by uuid, received_at timestamptz, updated_at timestamptz default now());
create table public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(), transfer_id uuid not null references public.inventory_transfers(id),
  material_id uuid not null references public.materials(id), unit_of_measure_id uuid not null references public.units_of_measure(id),
  dispatched_quantity numeric(20,4) not null check (dispatched_quantity > 0),
  received_quantity numeric(20,4) not null default 0 check (received_quantity >= 0 and received_quantity <= dispatched_quantity),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  dispatched_total_cost numeric(24,2) check (dispatched_total_cost is null or dispatched_total_cost >= 0),
  received_total_cost numeric(24,2) not null default 0 check (received_total_cost >= 0),
  variance_quantity numeric(20,4) not null default 0 check (variance_quantity >= 0),
  variance_total_cost numeric(24,2) not null default 0 check (variance_total_cost >= 0),
  constraint inventory_transfer_item_reconciled_quantity check (received_quantity + variance_quantity <= dispatched_quantity));
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id), quantity numeric(20,4) not null check (quantity > 0),
  unit_of_measure_id uuid not null references public.units_of_measure(id),
  source_location_id uuid references public.inventory_locations(id), destination_location_id uuid references public.inventory_locations(id),
  transaction_type public.inventory_transaction_type not null,
  transfer_id uuid references public.inventory_transfers(id), transfer_item_id uuid references public.inventory_transfer_items(id),
  transfer_phase public.transfer_phase, reference_document text not null, project_id uuid,
  responsible_user_id uuid not null references public.profiles(id), transaction_date date not null, remarks text,
  reversal_of uuid unique references public.inventory_transactions(id), created_at timestamptz not null default now(),
  cost_total numeric(24,2) check (cost_total is null or cost_total >= 0),
  cost_unit numeric(24,6) check (cost_unit is null or cost_unit >= 0));
create table public.inventory_valuations (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id), inventory_location_id uuid not null references public.inventory_locations(id),
  quantity_on_hand numeric(20,4) not null check (quantity_on_hand >= 0), total_value numeric(24,2) check (total_value >= 0),
  updated_at timestamptz not null default now(), unique (material_id, inventory_location_id));
create table public.inventory_transfer_variances (
  id uuid primary key default gen_random_uuid(), transfer_item_id uuid not null references public.inventory_transfer_items(id),
  quantity numeric(20,4) not null check (quantity > 0), cost_total numeric(24,2) not null check (cost_total >= 0),
  reason text not null, approved_by uuid not null references public.profiles(id), approved_at timestamptz not null default now());
create table public.valuation_command_receipts (
  idempotency_key uuid primary key, actor_id uuid not null, command_name text not null, payload_hash text not null,
  result_id uuid not null, created_at timestamptz not null default now());
create function private.existing_valuation_command(p_key uuid, p_command text, p_actor uuid, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_receipt public.valuation_command_receipts%rowtype;
begin
  select * into v_receipt from public.valuation_command_receipts where idempotency_key = p_key;
  if v_receipt.idempotency_key is null then return null; end if;
  if v_receipt.actor_id <> p_actor or v_receipt.command_name <> p_command or v_receipt.payload_hash <> p_hash then
    raise exception 'idempotency key was used for another valuation command' using errcode = '23505';
  end if;
  return v_receipt.result_id;
end; $$;

-- Command mimics: the same balance/transfer updates and ledger inserts, in the same order, as the production commands.
create function t_stock_in(p_m uuid, p_loc uuid, p_q numeric, p_cost numeric, p_date date default current_date) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); begin
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values (p_m, p_loc, p_q)
  on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, destination_location_id, transaction_type, reference_document, responsible_user_id, transaction_date, cost_total)
  values (v, p_m, p_q, '00000000-0000-0000-0000-0000000000b1', p_loc, 'STOCK_IN', 'PO-1', auth.uid(), p_date, p_cost);
  return v; end $$;
create function t_out(p_m uuid, p_loc uuid, p_q numeric, p_type public.inventory_transaction_type) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); begin
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_q where material_id = p_m and inventory_location_id = p_loc;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type, reference_document, responsible_user_id, transaction_date)
  values (v, p_m, p_q, '00000000-0000-0000-0000-0000000000b1', p_loc, p_type, 'USE-1', auth.uid(), current_date);
  return v; end $$;
create function t_dispatch(p_m uuid, p_src uuid, p_dst uuid, p_q numeric) returns uuid language plpgsql as $$
declare v_t uuid := gen_random_uuid(); v_i uuid := gen_random_uuid(); begin
  insert into public.inventory_transfers (id, transfer_number, source_location_id, destination_location_id) values (v_t, 'TR-' || left(v_t::text, 6), p_src, p_dst);
  insert into public.inventory_transfer_items (id, transfer_id, material_id, unit_of_measure_id, dispatched_quantity) values (v_i, v_t, p_m, '00000000-0000-0000-0000-0000000000b1', p_q);
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_q where material_id = p_m and inventory_location_id = p_src;
  insert into public.inventory_transactions (material_id, quantity, unit_of_measure_id, source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id, transfer_phase, reference_document, responsible_user_id, transaction_date)
  values (p_m, p_q, '00000000-0000-0000-0000-0000000000b1', p_src, p_dst, 'SITE_TRANSFER', v_t, v_i, 'dispatch', 'TR', auth.uid(), current_date);
  return v_i; end $$;
create function t_receive(p_item uuid, p_q numeric, p_finalize boolean default true) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); v_i public.inventory_transfer_items; v_t public.inventory_transfers; begin
  select * into v_i from public.inventory_transfer_items where id = p_item;
  select * into v_t from public.inventory_transfers where id = v_i.transfer_id;
  update public.inventory_transfer_items set received_quantity = received_quantity + p_q where id = p_item;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values (v_i.material_id, v_t.destination_location_id, p_q)
  on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id, transfer_phase, reference_document, responsible_user_id, transaction_date)
  values (v, v_i.material_id, p_q, v_i.unit_of_measure_id, v_t.source_location_id, v_t.destination_location_id, 'SITE_TRANSFER', v_t.id, v_i.id, 'receipt', 'TR', auth.uid(), current_date);
  if p_finalize then perform private.finalize_transfer_receipt_cost(p_item, v); end if;
  return v; end $$;
-- Reversal of a stock-out / consumption / dispatch: balance back at the source, then the REVERSAL row.
create function t_reverse(p_tx uuid) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); o public.inventory_transactions; begin
  select * into o from public.inventory_transactions where id = p_tx;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values (o.material_id, o.source_location_id, o.quantity)
  on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand;
  if o.transfer_phase = 'dispatch' then update public.inventory_transfers set status = 'cancelled' where id = o.transfer_id; end if;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, destination_location_id, transaction_type, reference_document, responsible_user_id, transaction_date, remarks, reversal_of)
  values (v, o.material_id, o.quantity, o.unit_of_measure_id, o.source_location_id, 'REVERSAL', 'REV', auth.uid(), current_date, 'test', o.id);
  return v; end $$;
