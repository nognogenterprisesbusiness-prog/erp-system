-- Finance gets read-only access to purchasing and inventory, as in a standard
-- ERP: it checks spending, supplier costs and stock value but does not create
-- or change them. Before this, the purchase-order policies (named
-- *_finance_read but written before the Finance role existed) allowed Admin
-- only, and Finance saw no purchase orders, suppliers, prices or stock.
--
-- Only read policies and read helpers change. No write command, grant or
-- policy for insert/update/delete is touched. can_access_warehouse is left
-- unchanged because write commands use it.
--
-- Safe to rerun: policies are dropped before being created; functions use OR REPLACE.

-- Suppliers, supplier materials, prices, categories and events.
create or replace function private.can_view_suppliers()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['admin','finance']::public.app_role[]) $$;

-- Purchase orders, lines and receipts.
drop policy if exists purchase_orders_finance_read on public.purchase_orders;
create policy purchase_orders_finance_read on public.purchase_orders for select to authenticated
using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
drop policy if exists purchase_order_lines_finance_read on public.purchase_order_lines;
create policy purchase_order_lines_finance_read on public.purchase_order_lines for select to authenticated
using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
drop policy if exists purchase_order_receipts_finance_read on public.purchase_order_receipts;
create policy purchase_order_receipts_finance_read on public.purchase_order_receipts for select to authenticated
using ((select private.has_any_role(array['admin','finance']::public.app_role[])));

-- Stock balances, movements, transfers and counts at every location.
create or replace function private.can_view_inventory_location(target_location_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_inventory()
    or private.has_any_role(array['finance']::public.app_role[])
    or exists (
    select 1 from public.inventory_locations location
    where location.id = target_location_id and (
      (location.warehouse_id is not null and private.can_access_warehouse(location.warehouse_id))
      or (location.project_site_id is not null and exists (select 1 from public.project_sites site
        where site.id = location.project_site_id and private.can_access_project_site(site.project_id,site.id)))
    )
  );
$$;

drop policy if exists inventory_locations_finance_select on public.inventory_locations;
create policy inventory_locations_finance_select on public.inventory_locations for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));

drop policy if exists warehouses_finance_select on public.warehouses;
create policy warehouses_finance_select on public.warehouses for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));

-- Stock value per location.
drop policy if exists inventory_valuations_finance_select on public.inventory_valuations;
create policy inventory_valuations_finance_select on public.inventory_valuations for select to authenticated
using (private.has_any_role(array['finance']::public.app_role[]));

-- Material cost per project (Finance reads every project; Admin/Engineer keep
-- their existing assignment rule).
create or replace function public.get_project_material_cost(p_project_id uuid)
returns table (material_id uuid, material_code text, material_name text,
  quantity numeric, unit_symbol text, cost_total numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (
    private.has_any_role(array['finance']::public.app_role[])
    or (private.can_access_project(p_project_id) and private.has_any_role(array['admin','engineer']::public.app_role[]))
  ) then
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
revoke execute on function private.can_view_suppliers(), private.can_view_inventory_location(uuid) from public, anon;
grant execute on function private.can_view_suppliers(), private.can_view_inventory_location(uuid) to authenticated;

-- Movement costs for the transaction history, for Admin and Finance only. The
-- cost columns stay hidden from direct table reads; the history page asked
-- for cost_total directly and failed with "permission denied" for every role.
create or replace function public.get_inventory_transaction_costs(p_transaction_ids uuid[])
returns table (transaction_id uuid, cost_total numeric, cost_unit numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'not authorized for stock movement costs' using errcode = '42501';
  end if;
  if coalesce(array_length(p_transaction_ids, 1), 0) > 200 then
    raise exception 'too many transactions requested' using errcode = '22023';
  end if;
  return query select t.id, t.cost_total, t.cost_unit
    from public.inventory_transactions t where t.id = any(p_transaction_ids);
end; $$;
revoke execute on function public.get_inventory_transaction_costs(uuid[]) from public, anon;
grant execute on function public.get_inventory_transaction_costs(uuid[]) to authenticated;
