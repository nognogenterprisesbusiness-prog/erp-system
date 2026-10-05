-- Show which store each price batch and stock-in came from (client: the same
-- cement is bought from Ace Hardware and City Hardware at different prices).
-- A batch keeps its number when stock moves, so its store is found from the
-- original stock-in (purchase order receipt or approved site purchase).
--
-- Both functions only add a column; their access rules are unchanged.
-- Safe to rerun: functions are dropped and recreated.

-- Store that supplied a stock-in movement, if any.
create or replace function private.stock_in_supplier_name(p_transaction_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.supplier_name from public.purchase_order_receipts r
       join public.purchase_orders o on o.id = r.purchase_order_id
       where r.inventory_transaction_id = p_transaction_id limit 1),
    (select p.supplier_name from public.site_purchase_lines l
       join public.site_purchases p on p.id = l.site_purchase_id
       where l.inventory_transaction_id = p_transaction_id limit 1));
$$;
revoke execute on function private.stock_in_supplier_name(uuid) from public, anon, authenticated;

drop function if exists public.get_material_cost_batches(uuid);
create function public.get_material_cost_batches(p_material_id uuid)
returns table (location_id uuid, location_name text, location_type text, batch_number bigint,
  batch_date date, unit_cost numeric, remaining_quantity numeric, remaining_value numeric, use_order bigint,
  supplier_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for stock batch prices' using errcode = '42501';
  end if;
  return query
  select loc.id, coalesce(w.name, s.name), loc.location_type::text, cl.batch_number, cl.batch_date,
    cl.unit_cost, cl.remaining_quantity, cl.remaining_value,
    row_number() over (partition by loc.id order by (cl.batch_number = 0), cl.batch_date desc, cl.batch_number desc),
    (select private.stock_in_supplier_name(origin.source_transaction_id)
       from public.inventory_cost_layers origin
       where origin.material_id = cl.material_id and origin.batch_number = cl.batch_number
         and origin.batch_number <> 0 and origin.source_transaction_id is not null
       limit 1)
  from public.inventory_cost_layers cl
  join public.inventory_locations loc on loc.id = cl.inventory_location_id
  left join public.warehouses w on w.id = loc.warehouse_id
  left join public.project_sites s on s.id = loc.project_site_id
  where cl.material_id = p_material_id and cl.remaining_quantity > 0
  order by coalesce(w.name, s.name), loc.id, (cl.batch_number = 0), cl.batch_date desc, cl.batch_number desc;
end; $$;

drop function if exists public.get_inventory_transaction_costs(uuid[]);
create function public.get_inventory_transaction_costs(p_transaction_ids uuid[])
returns table (transaction_id uuid, cost_total numeric, cost_unit numeric, supplier_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for stock movement costs' using errcode = '42501';
  end if;
  if coalesce(array_length(p_transaction_ids, 1), 0) > 200 then
    raise exception 'too many transactions requested' using errcode = '22023';
  end if;
  return query select t.id, t.cost_total, t.cost_unit,
      case when t.transaction_type = 'STOCK_IN' then private.stock_in_supplier_name(t.id) end
    from public.inventory_transactions t where t.id = any(p_transaction_ids);
end; $$;

revoke execute on function public.get_material_cost_batches(uuid), public.get_inventory_transaction_costs(uuid[]) from public, anon;
grant execute on function public.get_material_cost_batches(uuid), public.get_inventory_transaction_costs(uuid[]) to authenticated;
