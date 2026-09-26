-- Manual reconciliation only. This command never invents historical cost.
create table public.inventory_legacy_transit_values (
  id uuid primary key default gen_random_uuid(),
  transfer_item_id uuid not null unique references public.inventory_transfer_items(id) on delete restrict,
  verified_dispatched_total_cost numeric(24,2) not null check (verified_dispatched_total_cost > 0),
  verified_received_total_cost numeric(24,2) not null check (verified_received_total_cost >= 0),
  supporting_reference text not null check (char_length(trim(supporting_reference)) between 3 and 120),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  command_payload jsonb not null
);
create trigger inventory_legacy_transit_values_audit after insert on public.inventory_legacy_transit_values
for each row execute function private.audit_row_change();
alter table public.inventory_legacy_transit_values enable row level security;
revoke all on public.inventory_legacy_transit_values from public, anon, authenticated;
grant select on public.inventory_legacy_transit_values to authenticated;
create policy inventory_legacy_transit_admin_read on public.inventory_legacy_transit_values for select to authenticated
using ((select private.has_any_role(array['admin']::public.app_role[])));

create function public.get_unvalued_legacy_transit_queue()
returns table(transfer_item_id uuid, transfer_number text, material_code text, material_name text,
  source_name text, destination_name text, dispatched_quantity numeric, received_quantity numeric,
  remaining_quantity numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.can_manage_inventory() then
    raise exception 'Only an administrator can review legacy transit valuation' using errcode = '42501';
  end if;
  return query select i.id, t.transfer_number, m.code, m.name,
    case when sw.id is not null then sw.name else ss.name end,
    case when dw.id is not null then dw.name else ds.name end,
    i.dispatched_quantity, i.received_quantity,
    i.dispatched_quantity - i.received_quantity - i.variance_quantity
  from public.inventory_transfer_items i
  join public.inventory_transfers t on t.id = i.transfer_id
  join public.materials m on m.id = i.material_id
  join public.inventory_locations sl on sl.id = t.source_location_id
  join public.inventory_locations dl on dl.id = t.destination_location_id
  left join public.warehouses sw on sw.id = sl.warehouse_id
  left join public.warehouses dw on dw.id = dl.warehouse_id
  left join public.project_sites ss on ss.id = sl.project_site_id
  left join public.project_sites ds on ds.id = dl.project_site_id
  where i.dispatched_total_cost is null
    and i.dispatched_quantity > i.received_quantity + i.variance_quantity
  order by t.created_at, t.transfer_number, m.code
  limit 500;
end;
$$;

create function public.verify_legacy_transit_value(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_dispatched_total_cost numeric,
  p_received_total_cost numeric, p_supporting_reference text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.inventory_legacy_transit_values;
  v_item public.inventory_transfer_items;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.can_manage_inventory() then
    raise exception 'Only an administrator can verify legacy transit value' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_transfer_item_id is null
    or p_dispatched_total_cost is null or p_dispatched_total_cost <= 0
    or p_dispatched_total_cost <> round(p_dispatched_total_cost, 2)
    or p_received_total_cost is null or p_received_total_cost < 0
    or p_received_total_cost <> round(p_received_total_cost, 2)
    or char_length(trim(coalesce(p_supporting_reference, ''))) not between 3 and 120
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Verified historical values and evidence are required' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('item', p_transfer_item_id, 'dispatched', p_dispatched_total_cost,
    'received', p_received_total_cost, 'reference', trim(p_supporting_reference), 'reason', trim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.inventory_legacy_transit_values where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.verified_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another reconciliation' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null or v_item.dispatched_total_cost is not null
    or v_item.dispatched_quantity <= v_item.received_quantity + v_item.variance_quantity then
    raise exception 'This transfer is not an unvalued in-transit opening item' using errcode = '22023';
  end if;
  if (v_item.received_quantity = 0 and p_received_total_cost <> 0)
    or (v_item.received_quantity > 0 and p_received_total_cost <= 0)
    or p_received_total_cost + v_item.variance_total_cost >= p_dispatched_total_cost then
    raise exception 'Historical received and in-transit values do not reconcile' using errcode = '22023';
  end if;
  update public.inventory_transfer_items set dispatched_total_cost = p_dispatched_total_cost,
    received_total_cost = p_received_total_cost, updated_at = now() where id = p_transfer_item_id;
  insert into public.inventory_legacy_transit_values (id, transfer_item_id,
    verified_dispatched_total_cost, verified_received_total_cost, supporting_reference,
    reason, verified_by, idempotency_key, command_payload)
  values (v_id, p_transfer_item_id, p_dispatched_total_cost, p_received_total_cost,
    trim(p_supporting_reference), trim(p_reason), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;

revoke execute on function public.get_unvalued_legacy_transit_queue(),
  public.verify_legacy_transit_value(uuid,uuid,numeric,numeric,text,text) from public, anon;
grant execute on function public.get_unvalued_legacy_transit_queue(),
  public.verify_legacy_transit_value(uuid,uuid,numeric,numeric,text,text) to authenticated;
