create table public.inventory_low_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  inventory_balance_id uuid not null references public.inventory_balances(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  threshold_quantity numeric(20,4) not null check (threshold_quantity > 0),
  available_at_open numeric(20,4) not null check (available_at_open >= 0),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (resolved_at is null or resolved_at >= opened_at)
);
create unique index inventory_low_stock_one_open_idx on public.inventory_low_stock_alerts (inventory_balance_id)
  where resolved_at is null;
create index inventory_low_stock_location_open_idx on public.inventory_low_stock_alerts
  (inventory_location_id, opened_at desc) where resolved_at is null;

alter table public.inventory_low_stock_alerts enable row level security;
revoke all on public.inventory_low_stock_alerts from anon, authenticated;
grant select on public.inventory_low_stock_alerts to authenticated;
create policy inventory_low_stock_alerts_select_scoped on public.inventory_low_stock_alerts
  for select to authenticated using (private.can_view_inventory_location(inventory_location_id));

create function private.sync_low_stock_alert(p_balance_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_balance public.inventory_balances%rowtype;
  v_material public.materials%rowtype;
  v_location public.inventory_locations%rowtype;
  v_alert public.inventory_low_stock_alerts%rowtype;
  v_project_id uuid;
  v_roles public.app_role[];
begin
  select * into v_balance from public.inventory_balances where id = p_balance_id for update;
  if not found then return false; end if;
  select * into v_material from public.materials where id = v_balance.material_id;
  select * into v_location from public.inventory_locations where id = v_balance.inventory_location_id;
  select * into v_alert from public.inventory_low_stock_alerts
    where inventory_balance_id = p_balance_id and resolved_at is null for update;

  if v_location.project_site_id is not null then
    select project_id into v_project_id from public.project_sites where id = v_location.project_site_id;
    v_roles := array['super_admin','owner','admin','project_manager','engineer','foreman']::public.app_role[];
  else
    v_roles := array['super_admin','owner','admin','warehouse_staff']::public.app_role[];
  end if;

  if v_material.is_active and v_material.archived_at is null
     and v_material.minimum_stock_level > 0
     and v_balance.available_quantity <= v_material.minimum_stock_level then
    if v_alert.id is not null then return false; end if;
    insert into public.inventory_low_stock_alerts
      (inventory_balance_id, material_id, inventory_location_id, threshold_quantity, available_at_open)
      values (v_balance.id, v_balance.material_id, v_balance.inventory_location_id,
        v_material.minimum_stock_level, v_balance.available_quantity)
      returning * into v_alert;
    perform private.enqueue_notification_event(
      'low-stock-open-' || v_alert.id, 'INVENTORY', 'Low stock: ' || left(v_material.name, 130),
      'Available stock is at or below the minimum level at this location.', 'material', v_material.id,
      v_project_id, v_location.warehouse_id, 'high', v_roles, '{}'::uuid[], null
    );
    return true;
  end if;

  if v_alert.id is not null then
    update public.inventory_low_stock_alerts set resolved_at = now() where id = v_alert.id;
    perform private.enqueue_notification_event(
      'low-stock-resolved-' || v_alert.id, 'INVENTORY', 'Stock recovered: ' || left(v_material.name, 125),
      'Available stock is above the minimum level at this location.', 'material', v_material.id,
      v_project_id, v_location.warehouse_id, 'normal', v_roles, '{}'::uuid[], null
    );
    return true;
  end if;
  return false;
end; $$;

create function private.inventory_balance_low_stock_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_low_stock_alert(new.id);
  return new;
end; $$;
create trigger inventory_balance_low_stock_after_change
  after insert or update of quantity_on_hand, reserved_quantity on public.inventory_balances
  for each row execute function private.inventory_balance_low_stock_trigger();

create function private.reconcile_low_stock_alerts()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_balance_id uuid; v_changed integer := 0;
begin
  for v_balance_id in select id from public.inventory_balances order by id loop
    if private.sync_low_stock_alert(v_balance_id) then v_changed := v_changed + 1; end if;
  end loop;
  return v_changed;
end; $$;

revoke execute on function private.sync_low_stock_alert(uuid),
  private.inventory_balance_low_stock_trigger(), private.reconcile_low_stock_alerts()
  from public, anon, authenticated;

select cron.schedule('nognog-low-stock-reconciliation', '0 * * * *',
  'select private.reconcile_low_stock_alerts()');
