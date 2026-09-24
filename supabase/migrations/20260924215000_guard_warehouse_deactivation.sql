-- A retired warehouse keeps its identity and history, but may not hold stock or
-- be the endpoint of an unfinished movement or purchase receipt. Row locks on
-- operational writes serialize them with the status change.
create index inventory_valuations_location_idx
  on public.inventory_valuations (inventory_location_id, material_id);

-- Refuse to install the rule over already inconsistent historical records.
do $$ begin
  if exists (
    select 1 from public.warehouses w
    join public.inventory_locations l on l.warehouse_id = w.id
    join public.inventory_balances b on b.inventory_location_id = l.id
    where w.status = 'inactive' and (b.quantity_on_hand > 0 or b.reserved_quantity > 0)
  ) or exists (
    select 1 from public.warehouses w
    join public.inventory_locations l on l.warehouse_id = w.id
    join public.inventory_valuations v on v.inventory_location_id = l.id
    where w.status = 'inactive' and (v.quantity_on_hand > 0 or coalesce(v.total_value, 0) > 0)
  ) or exists (
    select 1 from public.warehouses w
    join public.inventory_locations l on l.warehouse_id = w.id
    join public.inventory_transfers t on l.id in (t.source_location_id, t.destination_location_id)
    where w.status = 'inactive' and t.status in ('dispatched', 'partially_received')
  ) or exists (
    select 1 from public.warehouses w
    join public.purchase_orders p on p.warehouse_id = w.id
    where w.status = 'inactive' and p.status in ('issued', 'partially_received')
  ) then
    raise exception 'Reconcile existing inactive warehouse stock, transfers and purchase orders before this migration';
  end if;
end $$;

create function private.guard_warehouse_deactivation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'inactive' then
    if exists (
      select 1 from public.inventory_locations l
      join public.inventory_balances b on b.inventory_location_id = l.id
      where l.warehouse_id = new.id
        and (b.quantity_on_hand > 0 or b.reserved_quantity > 0)
    ) or exists (
      select 1 from public.inventory_locations l
      join public.inventory_valuations v on v.inventory_location_id = l.id
      where l.warehouse_id = new.id
        and (v.quantity_on_hand > 0 or coalesce(v.total_value, 0) > 0)
    ) then
      raise exception 'Move or reconcile warehouse stock before marking it inactive' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.inventory_transfers t
      join public.inventory_locations l on l.id in (t.source_location_id, t.destination_location_id)
      where l.warehouse_id = new.id and t.status in ('dispatched', 'partially_received')
    ) then
      raise exception 'Resolve in-flight warehouse transfers before marking it inactive' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.purchase_orders p
      where p.warehouse_id = new.id and p.status in ('issued', 'partially_received')
    ) then
      raise exception 'Receive or cancel open warehouse purchase orders before marking it inactive' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

create trigger warehouses_guard_deactivation
before update of status on public.warehouses
for each row execute function private.guard_warehouse_deactivation();

-- Lock the warehouse row before accepting new positive stock. A concurrent
-- deactivation must either wait for this movement and then see its stock, or
-- finish first and cause this movement to fail.
create function private.require_active_warehouse_for_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.warehouse_status;
begin
  if new.quantity_on_hand > 0 or new.reserved_quantity > 0 then
    select w.status into v_status
    from public.inventory_locations l
    join public.warehouses w on w.id = l.warehouse_id
    where l.id = new.inventory_location_id
    for share of w;
    if v_status = 'inactive' then
      raise exception 'Inactive warehouse cannot receive or retain stock' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;

create trigger inventory_balances_require_active_warehouse
before insert or update of inventory_location_id, quantity_on_hand, reserved_quantity
on public.inventory_balances
for each row execute function private.require_active_warehouse_for_balance();

-- A transfer may be created before it changes the destination balance. Lock
-- both warehouse endpoints in stable order to close that concurrency window.
create function private.require_active_warehouses_for_transfer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_warehouse_id uuid; v_status public.warehouse_status;
begin
  for v_warehouse_id in
    select distinct l.warehouse_id from public.inventory_locations l
    where l.id in (new.source_location_id, new.destination_location_id)
      and l.warehouse_id is not null
    order by l.warehouse_id
  loop
    select status into v_status from public.warehouses
    where id = v_warehouse_id for share;
    if v_status <> 'active' then
      raise exception 'Transfer requires active warehouse endpoints' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end; $$;

create trigger inventory_transfers_require_active_warehouses
before insert or update of source_location_id, destination_location_id
on public.inventory_transfers
for each row execute function private.require_active_warehouses_for_transfer();

create function private.require_active_warehouse_for_purchase_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.warehouse_status;
begin
  select status into v_status from public.warehouses
  where id = new.warehouse_id for share;
  if v_status <> 'active' then
    raise exception 'Purchase order requires an active warehouse' using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger purchase_orders_require_active_warehouse
before insert or update of warehouse_id on public.purchase_orders
for each row execute function private.require_active_warehouse_for_purchase_order();

revoke execute on function private.guard_warehouse_deactivation(),
  private.require_active_warehouse_for_balance(),
  private.require_active_warehouses_for_transfer(),
  private.require_active_warehouse_for_purchase_order()
from public, anon, authenticated;
