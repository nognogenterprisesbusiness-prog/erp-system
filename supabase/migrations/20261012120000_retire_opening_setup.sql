begin;
-- Block postings during the check/drop boundary. No balance or costing data is deleted.
lock table public.inventory_balances,public.inventory_valuations,public.inventory_transfer_items,
  public.inventory_cost_layers,public.inventory_transactions in share row exclusive mode;
do $$
declare v_stock bigint; v_transit bigint; v_missing bigint; v_balance bigint; v_transit_batches bigint;
begin
  select count(*) into v_stock from public.inventory_balances b
    left join public.inventory_valuations v on v.material_id=b.material_id and v.inventory_location_id=b.inventory_location_id
    where b.quantity_on_hand>0 and (v.id is null or v.total_value is null);
  select count(*) into v_transit from public.inventory_transfer_items
    where dispatched_quantity>received_quantity+variance_quantity and dispatched_total_cost is null;
  select count(*) into v_missing from public.inventory_valuations v where v.total_value is not null and (
    v.quantity_on_hand<>(select coalesce(sum(l.remaining_quantity),0) from public.inventory_cost_layers l where l.material_id=v.material_id and l.inventory_location_id=v.inventory_location_id)
    or v.total_value<>(select coalesce(sum(l.remaining_value),0) from public.inventory_cost_layers l where l.material_id=v.material_id and l.inventory_location_id=v.inventory_location_id));
  select count(*) into v_balance from public.inventory_balances b
    join public.inventory_valuations v on v.material_id=b.material_id and v.inventory_location_id=b.inventory_location_id
    where v.total_value is not null and b.quantity_on_hand<>v.quantity_on_hand;
  select count(*) into v_transit_batches from public.inventory_transfer_items i
    join public.inventory_transfers t on t.id=i.transfer_id
    where t.status<>'cancelled' and i.dispatched_total_cost is not null and (
      i.dispatched_quantity-i.received_quantity-i.variance_quantity<>(select coalesce(sum(l.remaining_quantity),0) from public.inventory_cost_layers l where l.transfer_item_id=i.id)
      or i.dispatched_total_cost-i.received_total_cost-i.variance_total_cost<>(select coalesce(sum(l.remaining_value),0) from public.inventory_cost_layers l where l.transfer_item_id=i.id));
  if v_stock>0 or v_transit>0 or v_missing>0 or v_balance>0 or v_transit_batches>0 then
    raise exception 'Opening setup cleanup blocked: % unvalued stock locations, % unvalued in-transit items, % inconsistent batch totals, % balance/valuation mismatches, % inconsistent transit batches. Reconcile documented quantities and costs before rerunning; setup has been retained.',v_stock,v_transit,v_missing,v_balance,v_transit_batches using errcode='55000';
  end if;
  -- PL/pgSQL body references are not always represented in pg_depend.
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
      and p.proname not in ('verify_opening_stock_value','verify_legacy_transit_value')
      and (p.prosrc ilike '%public.inventory_opening_values%' or p.prosrc ilike '%public.inventory_legacy_transit_values%')) then
    raise exception 'Opening setup cleanup blocked: a function still references setup tables. Review pg_proc dependencies before rerunning.' using errcode='55000';
  end if;
end $$;
-- RESTRICT is intentional: unexpected views/FKs must stop the migration.
drop function public.verify_opening_stock_value(uuid,uuid,uuid,numeric,numeric,text);
drop function public.verify_legacy_transit_value(uuid,uuid,numeric,numeric,text,text);
drop function public.get_unvalued_legacy_transit_queue();
drop trigger inventory_valuations_open_cost_layer on public.inventory_valuations;
drop trigger inventory_transfer_items_open_cost_layer on public.inventory_transfer_items;
drop function private.open_inventory_cost_layer();
drop function private.open_transit_cost_layer();
drop table public.inventory_opening_values;
drop table public.inventory_legacy_transit_values;
notify pgrst,'reload schema';
commit;
