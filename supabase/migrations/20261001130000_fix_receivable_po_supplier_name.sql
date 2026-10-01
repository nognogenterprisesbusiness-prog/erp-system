-- Fix for 20261001110000: suppliers has no "name" column, so the delivery list
-- failed with "column s.name does not exist". Use the supplier name stored on
-- the purchase order, which is also what the printed PO shows.
--
-- Safe to rerun: the function uses OR REPLACE.

-- Deliveries waiting at the caller's warehouses. No prices or totals are returned.
create or replace function public.get_warehouse_receivable_po_lines()
returns table (line_id uuid, order_id uuid, po_number text, supplier_name text,
  warehouse_id uuid, warehouse_name text, ordered_on date, expected_on date,
  material_code text, material_name text, unit_symbol text,
  ordered_quantity numeric, received_quantity numeric, remaining_quantity numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
    raise exception 'not authorized to receive purchase orders' using errcode = '42501';
  end if;
  return query
  select l.id, o.id, o.po_number, o.supplier_name, w.id, w.name, o.ordered_on, o.expected_on,
    m.code, m.name, u.symbol, l.ordered_quantity, l.received_quantity, l.ordered_quantity - l.received_quantity
  from public.purchase_orders o
  join public.purchase_order_lines l on l.purchase_order_id = o.id
  join public.warehouses w on w.id = o.warehouse_id
  join public.materials m on m.id = l.material_id
  join public.units_of_measure u on u.id = l.unit_of_measure_id
  where o.status in ('issued','partially_received') and l.received_quantity < l.ordered_quantity
    and private.can_access_warehouse(o.warehouse_id)
  order by o.expected_on nulls last, o.po_number, m.name, l.id
  limit 500;
end; $$;

revoke execute on function public.get_warehouse_receivable_po_lines() from public, anon;
grant execute on function public.get_warehouse_receivable_po_lines() to authenticated;
