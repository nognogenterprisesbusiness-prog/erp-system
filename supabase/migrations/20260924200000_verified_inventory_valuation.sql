-- Financial stock values are intentionally absent until an administrator verifies
-- the opening on-hand quantity and total value. A missing value must never mean zero.
do $$ begin
  if exists (select 1 from public.inventory_transactions
    where transaction_type = 'STOCK_OUT' and project_id is not null) then
    raise exception 'project-tagged legacy stock-outs require audited cost reconciliation before valuation migration';
  end if;
end $$;
create table public.inventory_valuations (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity_on_hand numeric(20,4) not null check (quantity_on_hand >= 0),
  total_value numeric(24,2) check (total_value >= 0),
  updated_at timestamptz not null default now(),
  unique (material_id, inventory_location_id)
);
insert into public.inventory_valuations (material_id, inventory_location_id, quantity_on_hand, total_value)
select material_id, inventory_location_id, quantity_on_hand,
  case when quantity_on_hand = 0 then 0::numeric else null end
from public.inventory_balances;

create table public.inventory_opening_values (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  verified_quantity numeric(20,4) not null check (verified_quantity >= 0),
  verified_total_value numeric(24,2) not null check (verified_total_value > 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null default now(),
  unique (material_id, inventory_location_id)
);

create table public.valuation_command_receipts (
  idempotency_key uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  command_name text not null,
  payload_hash text not null,
  result_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.inventory_transactions
  add column cost_total numeric(24,2) check (cost_total is null or cost_total >= 0),
  add column cost_unit numeric(24,6) check (cost_unit is null or cost_unit >= 0);
alter table public.inventory_transfer_items
  add column dispatched_total_cost numeric(24,2) check (dispatched_total_cost is null or dispatched_total_cost >= 0),
  add column received_total_cost numeric(24,2) not null default 0 check (received_total_cost >= 0);

create function private.existing_valuation_command(p_key uuid, p_command text, p_actor uuid, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_receipt public.valuation_command_receipts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into v_receipt from public.valuation_command_receipts where idempotency_key = p_key;
  if v_receipt.idempotency_key is null then return null; end if;
  if v_receipt.actor_id <> p_actor or v_receipt.command_name <> p_command or v_receipt.payload_hash <> p_hash then
    raise exception 'idempotency key was used for another valuation command' using errcode = '23505';
  end if;
  return v_receipt.result_id;
end; $$;

-- The stock command updates quantity first. This BEFORE INSERT trigger locks the
-- matching financial projection, validates it against the quantity projection,
-- and posts the exact historical cost snapshot in the same database transaction.
create function private.post_inventory_valuation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_source public.inventory_valuations%rowtype;
  v_destination public.inventory_valuations%rowtype;
  v_item public.inventory_transfer_items%rowtype;
  v_original public.inventory_transactions%rowtype;
  v_balance_quantity numeric;
  v_cost numeric(24,2);
begin
  if new.transaction_type = 'STOCK_IN' then
    if new.cost_total is null or new.source_location_id is not null or new.destination_location_id is null then
      raise exception 'stock-in requires an explicit verified total cost' using errcode = '22023';
    end if;
    v_cost := new.cost_total;
  elsif new.transaction_type = 'REVERSAL' then
    select * into v_original from public.inventory_transactions where id = new.reversal_of;
    if v_original.id is null or v_original.cost_total is null then
      raise exception 'unvalued movement requires an audited correction plan' using errcode = '22023';
    end if;
    if v_original.transaction_type = 'STOCK_IN' or v_original.transfer_phase = 'receipt' then
      raise exception 'valued stock-in or transfer receipt requires a dedicated correction workflow' using errcode = '0A000';
    end if;
    v_cost := v_original.cost_total;
  elsif new.transfer_phase = 'receipt' then
    select * into v_item from public.inventory_transfer_items where id = new.transfer_item_id for update;
    if v_item.dispatched_total_cost is null then
      raise exception 'transfer has no verified dispatched cost' using errcode = '22023';
    end if;
    if v_item.received_quantity = v_item.dispatched_quantity then
      v_cost := v_item.dispatched_total_cost - v_item.received_total_cost;
    else
      v_cost := round(v_item.dispatched_total_cost * new.quantity / v_item.dispatched_quantity, 2);
    end if;
    if v_cost < 0 or v_cost > v_item.dispatched_total_cost - v_item.received_total_cost then
      raise exception 'transfer cost does not reconcile' using errcode = '22023';
    end if;
    update public.inventory_transfer_items set received_total_cost = received_total_cost + v_cost where id = v_item.id;
  elsif new.transaction_type not in ('STOCK_OUT','WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN','MATERIAL_CONSUMPTION')
    or (new.transaction_type in ('WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN') and new.transfer_phase <> 'dispatch') then
    raise exception 'this stock movement needs an approved valuation workflow' using errcode = '0A000';
  end if;

  if new.source_location_id is not null and (new.transfer_phase is distinct from 'receipt') then
    select * into v_source from public.inventory_valuations
      where material_id = new.material_id and inventory_location_id = new.source_location_id for update;
    if v_source.id is null or v_source.total_value is null or v_source.quantity_on_hand < new.quantity then
      raise exception 'source stock has no verified value or insufficient valued quantity' using errcode = '22023';
    end if;
    if new.transaction_type <> 'REVERSAL' then
      v_cost := case when v_source.quantity_on_hand = new.quantity then v_source.total_value
        else round(v_source.total_value * new.quantity / v_source.quantity_on_hand, 2) end;
    end if;
    if v_source.total_value < v_cost then
      raise exception 'source value cannot cover this correction' using errcode = '22023';
    end if;
    update public.inventory_valuations set quantity_on_hand = quantity_on_hand - new.quantity,
      total_value = total_value - v_cost, updated_at = now() where id = v_source.id;
    select quantity_on_hand into v_balance_quantity from public.inventory_balances
      where material_id = new.material_id and inventory_location_id = new.source_location_id;
    if v_balance_quantity is distinct from v_source.quantity_on_hand - new.quantity then
      raise exception 'source quantity and valuation do not reconcile' using errcode = '22023';
    end if;
    if new.transfer_phase = 'dispatch' then
      update public.inventory_transfer_items set dispatched_total_cost = v_cost where id = new.transfer_item_id;
    end if;
  end if;

  if new.destination_location_id is not null and
    (new.transaction_type in ('STOCK_IN','REVERSAL') or new.transfer_phase = 'receipt') and
    not (new.transaction_type = 'REVERSAL' and new.source_location_id is not null) then
    select quantity_on_hand into v_balance_quantity from public.inventory_balances
      where material_id = new.material_id and inventory_location_id = new.destination_location_id;
    insert into public.inventory_valuations (material_id, inventory_location_id, quantity_on_hand, total_value)
      select new.material_id, new.destination_location_id, 0, 0
      where v_balance_quantity = new.quantity
      on conflict (material_id, inventory_location_id) do nothing;
    select * into v_destination from public.inventory_valuations
      where material_id = new.material_id and inventory_location_id = new.destination_location_id for update;
    if v_destination.id is null or v_destination.total_value is null then
      raise exception 'destination stock has no verified opening value' using errcode = '22023';
    end if;
    if v_balance_quantity is distinct from v_destination.quantity_on_hand + new.quantity then
      raise exception 'destination quantity and valuation do not reconcile' using errcode = '22023';
    end if;
    update public.inventory_valuations set quantity_on_hand = quantity_on_hand + new.quantity,
      total_value = total_value + v_cost, updated_at = now() where id = v_destination.id;
  end if;
  new.cost_total := v_cost;
  new.cost_unit := round(v_cost / new.quantity, 6);
  return new;
end; $$;
create trigger inventory_transaction_value_before_insert
before insert on public.inventory_transactions
for each row execute function private.post_inventory_valuation();

create function public.verify_opening_stock_value(
  p_idempotency_key uuid, p_material_id uuid, p_location_id uuid,
  p_quantity numeric, p_total_value numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_balance public.inventory_balances%rowtype;
  v_valuation public.inventory_valuations%rowtype;
  v_id uuid;
begin
  if v_actor is null or not private.can_manage_inventory() then
    raise exception 'administrator approval required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_material_id is null or p_location_id is null or p_quantity is null
    or p_total_value is null or p_total_value <= 0 or p_total_value <> round(p_total_value, 2)
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'verified opening quantity, value and reason are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('material', p_material_id, 'location', p_location_id,
    'quantity', p_quantity, 'value', p_total_value, 'reason', trim(p_reason))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'verify_opening_stock_value', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  if not exists (select 1 from public.inventory_locations where id = p_location_id
    and (warehouse_id is not null or project_site_id is not null)) then
    raise exception 'opening value requires a warehouse or project site' using errcode = '22023';
  end if;
  select * into v_balance from public.inventory_balances
    where material_id = p_material_id and inventory_location_id = p_location_id for update;
  if v_balance.id is null or v_balance.quantity_on_hand <> p_quantity then
    raise exception 'verified quantity does not match posted stock' using errcode = '22023';
  end if;
  perform private.validate_inventory_quantity(p_quantity, (select base_unit_id from public.materials where id = p_material_id));
  select * into v_valuation from public.inventory_valuations
    where material_id = p_material_id and inventory_location_id = p_location_id for update;
  if v_valuation.id is null or v_valuation.total_value is not null then
    raise exception 'opening value is already verified or stock is missing' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_transfer_items i
    join public.inventory_transfers t on t.id = i.transfer_id
    where i.material_id = p_material_id and i.dispatched_quantity > i.received_quantity
      and i.dispatched_total_cost is null
      and (t.source_location_id = p_location_id or t.destination_location_id = p_location_id)) then
    raise exception 'verify related legacy in-transit value before opening location value' using errcode = '22023';
  end if;
  insert into public.inventory_opening_values
    (material_id, inventory_location_id, verified_quantity, verified_total_value, reason, verified_by)
  values (p_material_id, p_location_id, p_quantity, p_total_value, trim(p_reason), v_actor)
  returning id into v_id;
  update public.inventory_valuations set total_value = p_total_value, updated_at = now() where id = v_valuation.id;
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
  values (p_idempotency_key, v_actor, 'verify_opening_stock_value', v_hash, v_id);
  return v_id;
end; $$;

-- Shared posting primitive. Its callers must authorize the destination and price
-- source; the primitive keeps the balance and immutable ledger entry together.
create function private.post_valued_stock_in_core(
  p_actor uuid, p_material_id uuid, p_destination_location_id uuid,
  p_quantity numeric, p_unit_id uuid, p_total_cost numeric,
  p_reference_document text, p_transaction_date date, p_remarks text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if p_actor is null or p_transaction_date is null or p_total_cost is null
    or p_total_cost <= 0 or p_total_cost <> round(p_total_cost, 2)
    or char_length(trim(coalesce(p_reference_document, ''))) not between 2 and 120
    or not exists (select 1 from public.inventory_locations where id = p_destination_location_id and warehouse_id is not null) then
    raise exception 'Invalid valued warehouse receipt' using errcode = '22023';
  end if;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand)
  values (p_material_id, p_destination_location_id, p_quantity)
  on conflict (material_id, inventory_location_id) do update
    set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  insert into public.inventory_transactions
    (id, material_id, quantity, unit_of_measure_id, destination_location_id, transaction_type,
      reference_document, responsible_user_id, transaction_date, remarks, cost_total)
  values (v_id, p_material_id, p_quantity, p_unit_id, p_destination_location_id, 'STOCK_IN',
    trim(p_reference_document), p_actor, p_transaction_date, nullif(trim(p_remarks), ''), p_total_cost);
  return v_id;
end; $$;
revoke execute on function private.post_valued_stock_in_core(uuid,uuid,uuid,numeric,uuid,numeric,text,date,text)
  from public, anon, authenticated;

create function public.post_valued_stock_in(
  p_idempotency_key uuid, p_material_id uuid, p_destination_location_id uuid,
  p_quantity numeric, p_unit_id uuid, p_total_cost numeric,
  p_reference_document text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or p_idempotency_key is null or p_total_cost is null
    or p_total_cost <= 0 or p_total_cost <> round(p_total_cost, 2)
    or char_length(trim(coalesce(p_reference_document, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_remarks, ''))) not between 3 and 2000 then
    raise exception 'quantity, total cost and reference are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('material', p_material_id, 'location', p_destination_location_id,
    'quantity', p_quantity, 'unit', p_unit_id, 'cost', p_total_cost, 'reference', trim(p_reference_document),
    'date', p_transaction_date, 'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'post_valued_stock_in', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not private.can_manage_inventory()
    or not exists (select 1 from public.inventory_locations where id = p_destination_location_id and warehouse_id is not null) then
    raise exception 'not authorized for destination warehouse' using errcode = '42501';
  end if;
  v_id := private.post_valued_stock_in_core(v_actor, p_material_id, p_destination_location_id,
    p_quantity, p_unit_id, p_total_cost, p_reference_document, p_transaction_date, p_remarks);
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
  values (p_idempotency_key, v_actor, 'post_valued_stock_in', v_hash, v_id);
  return v_id;
end; $$;

create function public.consume_site_material(
  p_idempotency_key uuid, p_material_id uuid, p_site_location_id uuid,
  p_project_id uuid, p_quantity numeric, p_unit_id uuid,
  p_reference_document text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_id uuid := gen_random_uuid();
  v_available numeric;
begin
  if v_actor is null or p_idempotency_key is null or p_transaction_date is null
    or char_length(trim(coalesce(p_reference_document, ''))) not between 2 and 120 then
    raise exception 'consumption date and reference are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('material', p_material_id, 'site', p_site_location_id,
    'project', p_project_id, 'quantity', p_quantity, 'unit', p_unit_id,
    'reference', trim(p_reference_document), 'date', p_transaction_date,
    'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'consume_site_material', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not exists (select 1 from public.inventory_locations il
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where il.id = p_site_location_id and ps.project_id = p_project_id
      and ps.status = 'active' and p.status = 'active' and p.archived_at is null) then
    raise exception 'active site does not belong to project' using errcode = '22023';
  end if;
  if not private.can_manage_inventory() and not (
    private.has_any_role(array['engineer','foreman']::public.app_role[])
    and private.can_access_project(p_project_id)) then
    raise exception 'not authorized for project consumption' using errcode = '42501';
  end if;
  select available_quantity into v_available from public.inventory_balances
    where material_id = p_material_id and inventory_location_id = p_site_location_id for update;
  if coalesce(v_available, 0) < p_quantity then
    raise exception 'insufficient site stock' using errcode = 'P0001';
  end if;
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now()
    where material_id = p_material_id and inventory_location_id = p_site_location_id;
  insert into public.inventory_transactions
    (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type,
      reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_id, p_material_id, p_quantity, p_unit_id, p_site_location_id, 'MATERIAL_CONSUMPTION',
    trim(p_reference_document), p_project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
  values (p_idempotency_key, v_actor, 'consume_site_material', v_hash, v_id);
  return v_id;
end; $$;

-- An unlinked warehouse write-off is not a project consumption. Reject project
-- tagging here so the project material-cost report cannot silently omit it.
alter function public.post_stock_out(uuid,uuid,uuid,numeric,uuid,text,date,uuid,text) set schema private;
alter function private.post_stock_out(uuid,uuid,uuid,numeric,uuid,text,date,uuid,text) rename to post_stock_out_unscoped;
revoke execute on function private.post_stock_out_unscoped(uuid,uuid,uuid,numeric,uuid,text,date,uuid,text)
  from public, anon, authenticated;
create function public.post_stock_out(
  p_idempotency_key uuid, p_material_id uuid, p_source_location_id uuid, p_quantity numeric,
  p_unit_id uuid, p_reference_document text, p_transaction_date date,
  p_project_id uuid default null, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_project_id is not null then
    raise exception 'project materials must be received at site and recorded as consumption' using errcode = '22023';
  end if;
  return private.post_stock_out_unscoped(p_idempotency_key, p_material_id, p_source_location_id,
    p_quantity, p_unit_id, p_reference_document, p_transaction_date, null, p_remarks);
end; $$;

create index inventory_transactions_project_cost_idx
  on public.inventory_transactions (project_id, transaction_date desc)
  where transaction_type = 'MATERIAL_CONSUMPTION';
create trigger inventory_opening_values_audit after insert on public.inventory_opening_values
  for each row execute function private.audit_row_change();
alter table public.inventory_valuations enable row level security;
alter table public.inventory_opening_values enable row level security;
alter table public.valuation_command_receipts enable row level security;
revoke all on public.inventory_valuations, public.inventory_opening_values,
  public.valuation_command_receipts from anon, authenticated;
grant select on public.inventory_valuations, public.inventory_opening_values to authenticated;
-- Previous table-wide SELECT grants would otherwise expose new cost columns to
-- every user allowed to see a quantity movement. Keep cost reads behind RPCs.
revoke select on public.inventory_transactions, public.inventory_transfer_items from authenticated;
grant select (id, material_id, quantity, unit_of_measure_id, source_location_id,
  destination_location_id, transaction_type, transfer_id, transfer_item_id,
  transfer_phase, reference_document, project_id, responsible_user_id,
  transaction_date, remarks, reversal_of, created_at)
  on public.inventory_transactions to authenticated;
grant select (id, transfer_id, material_id, unit_of_measure_id,
  dispatched_quantity, received_quantity, created_at, updated_at)
  on public.inventory_transfer_items to authenticated;
create policy inventory_valuations_select on public.inventory_valuations for select to authenticated
  using (private.can_manage_inventory() or
    (private.has_any_role(array['admin']::public.app_role[]) and private.can_view_inventory_location(inventory_location_id)));
create policy inventory_opening_values_admin_select on public.inventory_opening_values for select to authenticated
  using (private.can_manage_inventory());
revoke execute on function private.existing_valuation_command(uuid,text,uuid,text),
  private.post_inventory_valuation() from public, anon, authenticated;
revoke execute on function public.post_stock_in(uuid,uuid,uuid,numeric,uuid,text,date,text),
  public.post_stock_out(uuid,uuid,uuid,numeric,uuid,text,date,uuid,text),
  public.verify_opening_stock_value(uuid,uuid,uuid,numeric,numeric,text),
  public.post_valued_stock_in(uuid,uuid,uuid,numeric,uuid,numeric,text,date,text),
  public.consume_site_material(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text) from public, anon;
revoke execute on function public.post_stock_in(uuid,uuid,uuid,numeric,uuid,text,date,text) from authenticated;
grant execute on function public.post_stock_out(uuid,uuid,uuid,numeric,uuid,text,date,uuid,text) to authenticated;
grant execute on function public.verify_opening_stock_value(uuid,uuid,uuid,numeric,numeric,text),
  public.post_valued_stock_in(uuid,uuid,uuid,numeric,uuid,numeric,text,date,text),
  public.consume_site_material(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text) to authenticated;

create function public.get_project_material_cost(p_project_id uuid)
returns table (material_id uuid, material_code text, material_name text,
  quantity numeric, unit_symbol text, cost_total numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.can_access_project(p_project_id)
    or not private.has_any_role(array['admin','engineer']::public.app_role[]) then
    raise exception 'not authorized for project costs' using errcode = '42501';
  end if;
  if exists (select 1 from public.inventory_transactions t
    where t.project_id = p_project_id and t.transaction_type = 'MATERIAL_CONSUMPTION' and t.cost_total is null
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)) then
    raise exception 'project has unvalued material consumption' using errcode = '22023';
  end if;
  return query
  select m.id, m.code, m.name, sum(t.quantity), u.symbol, sum(t.cost_total)
    from public.inventory_transactions t
    join public.materials m on m.id = t.material_id
    join public.units_of_measure u on u.id = t.unit_of_measure_id
    where t.project_id = p_project_id and t.transaction_type = 'MATERIAL_CONSUMPTION'
      and not exists (select 1 from public.inventory_transactions r where r.reversal_of = t.id)
    group by m.id, m.code, m.name, u.symbol
    order by m.name;
end; $$;
revoke execute on function public.get_project_material_cost(uuid) from public, anon;
grant execute on function public.get_project_material_cost(uuid) to authenticated;
