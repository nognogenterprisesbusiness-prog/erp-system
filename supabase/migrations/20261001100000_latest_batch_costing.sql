-- Client decision 2026-10-01: material cost uses purchase batches, newest batch
-- first, instead of a moving weighted average. Example: 1,000 pcs bought at
-- PHP 100, then 1,000 pcs at PHP 200. The next 1,000 pcs used cost PHP 200 each;
-- only after that batch is exhausted does stock cost PHP 100 each.
--
-- inventory_valuations stays the per-location quantity/value total that every
-- report reads. inventory_cost_layers holds the batches behind that total, at a
-- location or in transit. Batches keep their purchase order when stock moves, so
-- a site uses the same newest-first order as the warehouse it was supplied from.
--
-- Forward-only: stock on hand before this migration was valued by average and
-- its batch history cannot be rebuilt without rewriting posted costs. It is
-- carried forward as batch 0 at each location and is used after every newer
-- purchase. Posted transaction costs are never changed.
--
-- Safe to rerun: objects use IF NOT EXISTS / OR REPLACE and backfills skip
-- rows that already exist.

lock table public.inventory_valuations, public.inventory_transfer_items
  in share row exclusive mode;

create sequence if not exists private.inventory_cost_batch_seq as bigint start with 1;

create table if not exists public.inventory_cost_layers (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid references public.inventory_locations(id) on delete restrict,
  transfer_item_id uuid references public.inventory_transfer_items(id) on delete restrict,
  batch_number bigint not null check (batch_number >= 0),
  batch_date date not null,
  unit_cost numeric(24,6) not null check (unit_cost >= 0),
  remaining_quantity numeric(20,4) not null check (remaining_quantity >= 0),
  remaining_value numeric(24,2) not null check (remaining_value >= 0),
  source_transaction_id uuid references public.inventory_transactions(id) on delete restrict deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_cost_layer_holder check ((inventory_location_id is null) <> (transfer_item_id is null))
);
-- One row per batch per holder (location or in-transit item); moves merge into it.
create unique index if not exists inventory_cost_layers_holder_batch_idx
  on public.inventory_cost_layers (material_id, (coalesce(inventory_location_id, transfer_item_id)), batch_number);
create index if not exists inventory_cost_layers_location_idx
  on public.inventory_cost_layers (inventory_location_id, material_id) where inventory_location_id is not null;

create table if not exists public.inventory_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.inventory_transactions(id) on delete restrict deferrable initially deferred,
  transfer_variance_id uuid references public.inventory_transfer_variances(id) on delete restrict deferrable initially deferred,
  material_id uuid not null references public.materials(id) on delete restrict,
  batch_number bigint not null,
  batch_date date not null,
  unit_cost numeric(24,6) not null,
  quantity numeric(20,4) not null check (quantity > 0),
  total_value numeric(24,2) not null check (total_value >= 0),
  created_at timestamptz not null default now(),
  constraint inventory_cost_allocation_owner check ((transaction_id is null) <> (transfer_variance_id is null))
);
create index if not exists inventory_cost_allocations_transaction_idx
  on public.inventory_cost_allocations (transaction_id) where transaction_id is not null;

alter table public.inventory_cost_layers enable row level security;
alter table public.inventory_cost_allocations enable row level security;
revoke all on public.inventory_cost_layers, public.inventory_cost_allocations from anon, authenticated;
revoke all on sequence private.inventory_cost_batch_seq from public, anon, authenticated;

-- Batch 0 (stock carried forward from average costing) is always used last.
create or replace function private.take_inventory_cost_layers(
  p_material_id uuid, p_location_id uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_id uuid, p_variance_id uuid
) returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_layer public.inventory_cost_layers%rowtype;
  v_needed numeric := p_quantity;
  v_take numeric;
  v_value numeric(24,2);
  v_total numeric(24,2) := 0;
begin
  if p_material_id is null or p_quantity is null or p_quantity <= 0
    or (p_location_id is null) = (p_transfer_item_id is null)
    or (p_transaction_id is null) = (p_variance_id is null) then
    raise exception 'invalid stock batch request' using errcode = '22023';
  end if;
  for v_layer in
    select * from public.inventory_cost_layers
    where material_id = p_material_id
      and coalesce(inventory_location_id, transfer_item_id) = coalesce(p_location_id, p_transfer_item_id)
      and remaining_quantity > 0
    order by (batch_number = 0), batch_date desc, batch_number desc
    for update
  loop
    exit when v_needed = 0;
    v_take := least(v_needed, v_layer.remaining_quantity);
    v_value := case when v_take = v_layer.remaining_quantity then v_layer.remaining_value
      else round(v_layer.remaining_value * v_take / v_layer.remaining_quantity, 2) end;
    update public.inventory_cost_layers
      set remaining_quantity = remaining_quantity - v_take,
        remaining_value = remaining_value - v_value, updated_at = now()
      where id = v_layer.id;
    insert into public.inventory_cost_allocations
      (transaction_id, transfer_variance_id, material_id, batch_number, batch_date, unit_cost, quantity, total_value)
    values (p_transaction_id, p_variance_id, p_material_id, v_layer.batch_number, v_layer.batch_date,
      v_layer.unit_cost, v_take, v_value);
    v_total := v_total + v_value;
    v_needed := v_needed - v_take;
  end loop;
  if v_needed > 0 then
    raise exception 'priced stock batches do not cover this quantity' using errcode = '22023';
  end if;
  return v_total;
end; $$;

create or replace function private.put_inventory_cost_layer(
  p_material_id uuid, p_location_id uuid, p_transfer_item_id uuid, p_batch_number bigint,
  p_batch_date date, p_unit_cost numeric, p_quantity numeric, p_value numeric, p_source_transaction_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_quantity <= 0 then return; end if;
  insert into public.inventory_cost_layers as l
    (material_id, inventory_location_id, transfer_item_id, batch_number, batch_date,
      unit_cost, remaining_quantity, remaining_value, source_transaction_id)
  values (p_material_id, p_location_id, p_transfer_item_id, p_batch_number, p_batch_date,
    p_unit_cost, p_quantity, p_value, p_source_transaction_id)
  on conflict (material_id, (coalesce(inventory_location_id, transfer_item_id)), batch_number) do update
    set remaining_quantity = l.remaining_quantity + excluded.remaining_quantity,
      remaining_value = l.remaining_value + excluded.remaining_value,
      -- Batch 0 mixes carried-forward averages from different locations.
      unit_cost = case when l.batch_number = 0
        then round((l.remaining_value + excluded.remaining_value) / (l.remaining_quantity + excluded.remaining_quantity), 6)
        else l.unit_cost end,
      updated_at = now();
end; $$;

create or replace function private.put_inventory_cost_layers_from_allocations(
  p_transaction_id uuid, p_location_id uuid, p_transfer_item_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_allocation public.inventory_cost_allocations%rowtype;
begin
  for v_allocation in select * from public.inventory_cost_allocations
    where transaction_id = p_transaction_id order by batch_number
  loop
    perform private.put_inventory_cost_layer(v_allocation.material_id, p_location_id, p_transfer_item_id,
      v_allocation.batch_number, v_allocation.batch_date, v_allocation.unit_cost,
      v_allocation.quantity, v_allocation.total_value, null);
  end loop;
end; $$;

create or replace function private.assert_location_cost_layers(p_material_id uuid, p_location_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_valuation public.inventory_valuations%rowtype; v_quantity numeric; v_value numeric;
begin
  select * into v_valuation from public.inventory_valuations
    where material_id = p_material_id and inventory_location_id = p_location_id;
  if v_valuation.id is null or v_valuation.total_value is null then return; end if;
  select coalesce(sum(remaining_quantity), 0), coalesce(sum(remaining_value), 0) into v_quantity, v_value
    from public.inventory_cost_layers where material_id = p_material_id and inventory_location_id = p_location_id;
  if v_quantity <> v_valuation.quantity_on_hand or v_value <> v_valuation.total_value then
    raise exception 'stock batches and valuation do not reconcile' using errcode = '22023';
  end if;
end; $$;

create or replace function private.assert_transit_cost_layers(p_transfer_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.inventory_transfer_items%rowtype; v_quantity numeric; v_value numeric;
begin
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id;
  if v_item.id is null or v_item.dispatched_total_cost is null then return; end if;
  select coalesce(sum(remaining_quantity), 0), coalesce(sum(remaining_value), 0) into v_quantity, v_value
    from public.inventory_cost_layers where transfer_item_id = p_transfer_item_id;
  if v_quantity <> v_item.dispatched_quantity - v_item.received_quantity - v_item.variance_quantity
    or v_value <> v_item.dispatched_total_cost - v_item.received_total_cost - v_item.variance_total_cost then
    raise exception 'in-transit stock batches do not reconcile' using errcode = '22023';
  end if;
end; $$;

-- Backfill: carried-forward value becomes batch 0 at each location and in transit.
do $$ begin
  if exists (select 1 from public.inventory_valuations where quantity_on_hand = 0 and total_value is not null and total_value <> 0) then
    raise exception 'a location has value without quantity; reconcile it before batch costing' using errcode = '22023';
  end if;
end $$;
insert into public.inventory_cost_layers
  (material_id, inventory_location_id, batch_number, batch_date, unit_cost, remaining_quantity, remaining_value)
select v.material_id, v.inventory_location_id, 0, current_date,
  round(v.total_value / v.quantity_on_hand, 6), v.quantity_on_hand, v.total_value
from public.inventory_valuations v
where v.total_value is not null and v.quantity_on_hand > 0
  and not exists (select 1 from public.inventory_cost_layers l
    where l.material_id = v.material_id and l.inventory_location_id = v.inventory_location_id);
insert into public.inventory_cost_layers
  (material_id, transfer_item_id, batch_number, batch_date, unit_cost, remaining_quantity, remaining_value)
select i.material_id, i.id, 0, current_date,
  round((i.dispatched_total_cost - i.received_total_cost - i.variance_total_cost)
    / (i.dispatched_quantity - i.received_quantity - i.variance_quantity), 6),
  i.dispatched_quantity - i.received_quantity - i.variance_quantity,
  i.dispatched_total_cost - i.received_total_cost - i.variance_total_cost
from public.inventory_transfer_items i
join public.inventory_transfers t on t.id = i.transfer_id
where i.dispatched_total_cost is not null and t.status <> 'cancelled'
  and i.dispatched_quantity > i.received_quantity + i.variance_quantity
  and not exists (select 1 from public.inventory_cost_layers l where l.transfer_item_id = i.id);

-- Same flow as the previous version; only the cost of stock leaving a holder
-- changes from a proportional average to newest-batch-first.
create or replace function private.post_inventory_valuation()
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
    v_cost := private.take_inventory_cost_layers(new.material_id, null, v_item.id, new.quantity, new.id, null);
    update public.inventory_transfer_items set received_total_cost = received_total_cost + v_cost where id = v_item.id;
  elsif new.transaction_type not in ('STOCK_OUT','WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN','MATERIAL_CONSUMPTION')
    or (new.transaction_type in ('WAREHOUSE_TRANSFER','SITE_TRANSFER','MATERIAL_RETURN') and new.transfer_phase <> 'dispatch') then
    raise exception 'this stock movement needs an approved valuation workflow' using errcode = '0A000';
  end if;

  if new.source_location_id is not null and (new.transfer_phase is distinct from 'receipt') then
    if new.transaction_type = 'REVERSAL' then
      raise exception 'this correction needs a dedicated stock batch workflow' using errcode = '0A000';
    end if;
    select * into v_source from public.inventory_valuations
      where material_id = new.material_id and inventory_location_id = new.source_location_id for update;
    if v_source.id is null or v_source.total_value is null or v_source.quantity_on_hand < new.quantity then
      raise exception 'source stock has no verified value or insufficient valued quantity' using errcode = '22023';
    end if;
    v_cost := private.take_inventory_cost_layers(new.material_id, new.source_location_id, null, new.quantity, new.id, null);
    update public.inventory_valuations set quantity_on_hand = quantity_on_hand - new.quantity,
      total_value = total_value - v_cost, updated_at = now() where id = v_source.id;
    select quantity_on_hand into v_balance_quantity from public.inventory_balances
      where material_id = new.material_id and inventory_location_id = new.source_location_id;
    if v_balance_quantity is distinct from v_source.quantity_on_hand - new.quantity then
      raise exception 'source quantity and valuation do not reconcile' using errcode = '22023';
    end if;
    if new.transfer_phase = 'dispatch' then
      perform private.put_inventory_cost_layers_from_allocations(new.id, null, new.transfer_item_id);
      update public.inventory_transfer_items set dispatched_total_cost = v_cost where id = new.transfer_item_id;
    end if;
    perform private.assert_location_cost_layers(new.material_id, new.source_location_id);
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
    if new.transaction_type = 'STOCK_IN' then
      perform private.put_inventory_cost_layer(new.material_id, new.destination_location_id, null,
        nextval('private.inventory_cost_batch_seq'), new.transaction_date,
        round(v_cost / new.quantity, 6), new.quantity, v_cost, new.id);
    elsif new.transfer_phase = 'receipt' then
      perform private.put_inventory_cost_layers_from_allocations(new.id, new.destination_location_id, null);
    elsif exists (select 1 from public.inventory_cost_allocations where transaction_id = v_original.id) then
      perform private.put_inventory_cost_layers_from_allocations(v_original.id, new.destination_location_id, null);
    else
      -- The original movement was costed by average before batch costing began.
      perform private.put_inventory_cost_layer(new.material_id, new.destination_location_id, null,
        0, current_date, round(v_cost / new.quantity, 6), new.quantity, v_cost, null);
    end if;
    if new.transaction_type = 'REVERSAL' and v_original.transfer_phase = 'dispatch' then
      delete from public.inventory_cost_layers where transfer_item_id = v_original.transfer_item_id;
    end if;
    perform private.assert_location_cost_layers(new.material_id, new.destination_location_id);
  end if;

  if new.transfer_phase in ('dispatch', 'receipt') then
    perform private.assert_transit_cost_layers(new.transfer_item_id);
  end if;
  new.cost_total := v_cost;
  new.cost_unit := round(v_cost / new.quantity, 6);
  return new;
end; $$;

-- Opening-value verification turns unvalued stock into valued batch 0 stock.
create or replace function private.open_inventory_cost_layer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.total_value is null and new.total_value is not null and new.quantity_on_hand > 0 then
    perform private.put_inventory_cost_layer(new.material_id, new.inventory_location_id, null,
      0, current_date, round(new.total_value / new.quantity_on_hand, 6), new.quantity_on_hand, new.total_value, null);
  end if;
  return null;
end; $$;
drop trigger if exists inventory_valuations_open_cost_layer on public.inventory_valuations;
create trigger inventory_valuations_open_cost_layer
after update of total_value on public.inventory_valuations
for each row when (old.total_value is null and new.total_value is not null)
execute function private.open_inventory_cost_layer();

-- Verified legacy in-transit value becomes batch 0 in transit. A normal dispatch
-- already created its batches before setting the dispatched cost.
create or replace function private.open_transit_cost_layer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.inventory_cost_layers where transfer_item_id = new.id) then
    perform private.put_inventory_cost_layer(new.material_id, null, new.id, 0, current_date,
      round((new.dispatched_total_cost - new.received_total_cost - new.variance_total_cost)
        / nullif(new.dispatched_quantity - new.received_quantity - new.variance_quantity, 0), 6),
      new.dispatched_quantity - new.received_quantity - new.variance_quantity,
      new.dispatched_total_cost - new.received_total_cost - new.variance_total_cost, null);
  end if;
  return null;
end; $$;
drop trigger if exists inventory_transfer_items_open_cost_layer on public.inventory_transfer_items;
create trigger inventory_transfer_items_open_cost_layer
after update of dispatched_total_cost on public.inventory_transfer_items
for each row when (old.dispatched_total_cost is null and new.dispatched_total_cost is not null)
execute function private.open_transit_cost_layer();

-- Transit losses take the newest batches still in transit, matching receipts.
-- Only the cost line and the status casts differ from the previous version.
create or replace function public.approve_transfer_variance(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_item public.inventory_transfer_items%rowtype;
  v_transfer public.inventory_transfers%rowtype;
  v_remaining numeric;
  v_cost numeric(24,2);
  v_id uuid := gen_random_uuid();
  v_total_dispatched numeric;
  v_total_reconciled numeric;
begin
  if v_actor is null or not private.can_manage_inventory() then
    raise exception 'administrator variance approval required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_transfer_item_id is null or
    char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'transfer, quantity and approval reason are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('item', p_transfer_item_id, 'quantity', p_quantity,
    'reason', trim(p_reason))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'approve_transfer_variance', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null then raise exception 'transfer item not found' using errcode = 'P0002'; end if;
  perform private.validate_inventory_quantity(p_quantity, v_item.unit_of_measure_id);
  select * into v_transfer from public.inventory_transfers where id = v_item.transfer_id for update;
  if v_transfer.status in ('received', 'cancelled') then
    raise exception 'transfer cannot accept a variance' using errcode = '22023';
  end if;
  if v_item.dispatched_total_cost is null then
    raise exception 'unvalued transfer requires an audited correction plan' using errcode = '22023';
  end if;
  v_remaining := v_item.dispatched_quantity - v_item.received_quantity - v_item.variance_quantity;
  if p_quantity > v_remaining then
    raise exception 'variance exceeds remaining in-transit stock' using errcode = '22023';
  end if;
  v_cost := private.take_inventory_cost_layers(v_item.material_id, null, v_item.id, p_quantity, null, v_id);
  if v_cost > v_item.dispatched_total_cost - v_item.received_total_cost - v_item.variance_total_cost then
    raise exception 'variance cost does not reconcile' using errcode = '22023';
  end if;
  update public.inventory_transfer_items
    set variance_quantity = variance_quantity + p_quantity,
      variance_total_cost = variance_total_cost + v_cost, updated_at = now()
    where id = v_item.id;
  perform private.assert_transit_cost_layers(v_item.id);
  insert into public.inventory_transfer_variances
    (id, transfer_item_id, quantity, cost_total, reason, approved_by)
    values (v_id, v_item.id, p_quantity, v_cost, trim(p_reason), v_actor);
  select sum(dispatched_quantity), sum(received_quantity + variance_quantity)
    into v_total_dispatched, v_total_reconciled
    from public.inventory_transfer_items where transfer_id = v_transfer.id;
  -- The enum casts also fix the previous version, whose text CASE could not be
  -- assigned to the enum column, so no transit loss could be approved.
  update public.inventory_transfers
    set status = case when v_total_dispatched = v_total_reconciled
      then 'received'::public.transfer_status else 'partially_received'::public.transfer_status end,
      received_by = case when v_total_dispatched = v_total_reconciled then v_actor else received_by end,
      received_at = case when v_total_dispatched = v_total_reconciled then now() else received_at end,
      updated_at = now()
    where id = v_transfer.id;
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'approve_transfer_variance', v_hash, v_id);
  return v_id;
end; $$;

-- Batch takes consume each in-transit batch exactly, so a fully reconciled
-- transfer has no rounding remainder. Any remainder now means drift.
create or replace function private.finalize_transfer_receipt_cost(p_transfer_item_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.inventory_transfer_items%rowtype;
begin
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.received_quantity + v_item.variance_quantity <> v_item.dispatched_quantity then return; end if;
  if v_item.dispatched_total_cost - v_item.received_total_cost - v_item.variance_total_cost <> 0 then
    raise exception 'receipt cost cannot be reconciled' using errcode = '22023';
  end if;
end; $$;

-- Plan estimate falls back to the price of the batch that would be used next.
create or replace function public.get_project_material_estimate(p_project_id uuid)
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
    select round(cl.unit_cost, 2) as batch_cost
    from public.inventory_cost_layers cl
    join public.inventory_locations loc on loc.id = cl.inventory_location_id
    where loc.warehouse_id = l.warehouse_id and cl.material_id = l.material_id and cl.remaining_quantity > 0
    order by (cl.batch_number = 0), cl.batch_date desc, cl.batch_number desc
    limit 1
  ) stock on true
  cross join lateral (
    select coalesce(supplier.unit_price, stock.batch_cost) as unit_cost,
      case when supplier.unit_price is not null then 'supplier'
        when stock.batch_cost is not null then 'stock' end as source
  ) price
  where l.project_id = p_project_id
  order by l.required_on, l.id;
end; $$;

-- Batches on hand per location, in the order they will be used.
create or replace function public.get_material_cost_batches(p_material_id uuid)
returns table (location_id uuid, location_name text, location_type text, batch_number bigint,
  batch_date date, unit_cost numeric, remaining_quantity numeric, remaining_value numeric, use_order bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for stock batch prices' using errcode = '42501';
  end if;
  return query
  select loc.id, coalesce(w.name, s.name), loc.location_type::text, cl.batch_number, cl.batch_date,
    cl.unit_cost, cl.remaining_quantity, cl.remaining_value,
    row_number() over (partition by loc.id order by (cl.batch_number = 0), cl.batch_date desc, cl.batch_number desc)
  from public.inventory_cost_layers cl
  join public.inventory_locations loc on loc.id = cl.inventory_location_id
  left join public.warehouses w on w.id = loc.warehouse_id
  left join public.project_sites s on s.id = loc.project_site_id
  where cl.material_id = p_material_id and cl.remaining_quantity > 0
  order by coalesce(w.name, s.name), loc.id, (cl.batch_number = 0), cl.batch_date desc, cl.batch_number desc;
end; $$;

revoke execute on function
  private.take_inventory_cost_layers(uuid,uuid,uuid,numeric,uuid,uuid),
  private.put_inventory_cost_layer(uuid,uuid,uuid,bigint,date,numeric,numeric,numeric,uuid),
  private.put_inventory_cost_layers_from_allocations(uuid,uuid,uuid),
  private.assert_location_cost_layers(uuid,uuid),
  private.assert_transit_cost_layers(uuid),
  private.open_inventory_cost_layer(),
  private.open_transit_cost_layer(),
  private.finalize_transfer_receipt_cost(uuid,uuid),
  private.post_inventory_valuation()
  from public, anon, authenticated;
revoke execute on function public.get_material_cost_batches(uuid),
  public.get_project_material_estimate(uuid),
  public.approve_transfer_variance(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.get_material_cost_batches(uuid),
  public.get_project_material_estimate(uuid),
  public.approve_transfer_variance(uuid,uuid,numeric,text) to authenticated;
