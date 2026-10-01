-- Client decision 2026-10-01: the person who receives the delivery records it.
-- Warehouse Staff may receive purchase-order lines into a warehouse they are
-- assigned to. They post quantities only: the stock cost is the price on the PO
-- that Admin issued, and they never see it. A different received cost still
-- needs Admin and a reason.
--
-- Safe to rerun: functions use OR REPLACE.

create or replace function public.receive_purchase_order_line(
  p_idempotency_key uuid, p_line_id uuid, p_quantity numeric,
  p_goods_total_cost numeric, p_delivery_reference text, p_received_on date,
  p_cost_variance_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_is_admin boolean := private.has_any_role(array['admin']::public.app_role[]);
  v_payload jsonb;
  v_existing public.purchase_order_receipts;
  v_order public.purchase_orders;
  v_line public.purchase_order_lines;
  v_location_id uuid;
  v_expected numeric(18,2);
  v_cost numeric(18,2);
  v_transaction_id uuid;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not (v_is_admin or private.has_any_role(array['warehouse_staff']::public.app_role[])) then
    raise exception 'Only an administrator or warehouse staff can receive purchase orders' using errcode = '42501';
  end if;
  -- A null cost means "receive at the PO price"; it is the only option for Warehouse Staff.
  if p_idempotency_key is null or p_line_id is null or p_received_on is null
    or p_quantity is null or p_quantity <= 0
    or (p_goods_total_cost is not null and (p_goods_total_cost <= 0 or p_goods_total_cost <> round(p_goods_total_cost, 2)))
    or char_length(trim(coalesce(p_delivery_reference, ''))) not between 2 and 120 then
    raise exception 'Invalid purchase receipt' using errcode = '22023';
  end if;
  if p_goods_total_cost is not null and not v_is_admin then
    raise exception 'Only an administrator can change the received cost' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object('line', p_line_id, 'quantity', p_quantity, 'cost', p_goods_total_cost,
    'delivery_reference', trim(p_delivery_reference), 'received_on', p_received_on,
    'variance_reason', nullif(trim(coalesce(p_cost_variance_reason, '')), ''));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.purchase_order_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.received_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another receipt' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select o.* into v_order from public.purchase_orders o
  join public.purchase_order_lines l on l.purchase_order_id = o.id
  where l.id = p_line_id for update of o;
  if v_order.id is null or v_order.status not in ('issued','partially_received') then
    raise exception 'Purchase order is not receivable' using errcode = '22023';
  end if;
  if not v_is_admin and not private.can_access_warehouse(v_order.warehouse_id) then
    raise exception 'Not assigned to the purchase order warehouse' using errcode = '42501';
  end if;
  select * into v_line from public.purchase_order_lines where id = p_line_id for update;
  perform private.validate_inventory_quantity(p_quantity, v_line.unit_of_measure_id);
  if p_received_on < v_order.ordered_on or v_line.received_quantity + p_quantity > v_line.ordered_quantity then
    raise exception 'Receipt exceeds ordered quantity or predates the order' using errcode = '22023';
  end if;
  v_expected := round(p_quantity * v_line.unit_price, 2);
  v_cost := coalesce(p_goods_total_cost, v_expected);
  if v_cost <> v_expected and char_length(trim(coalesce(p_cost_variance_reason, ''))) not between 3 and 500 then
    raise exception 'Explain the difference from the PO goods price' using errcode = '22023';
  end if;
  if v_cost = v_expected and nullif(trim(coalesce(p_cost_variance_reason, '')), '') is not null then
    raise exception 'Cost variance reason is only for a changed cost' using errcode = '22023';
  end if;
  select id into v_location_id from public.inventory_locations where warehouse_id = v_order.warehouse_id;
  if v_location_id is null then raise exception 'Warehouse has no inventory location' using errcode = '22023'; end if;
  v_transaction_id := private.post_valued_stock_in_core(v_actor, v_line.material_id, v_location_id,
    p_quantity, v_line.unit_of_measure_id, v_cost,
    left(v_order.po_number || ' / ' || trim(p_delivery_reference), 120), p_received_on,
    case when v_cost <> v_expected then trim(p_cost_variance_reason) else null end);
  insert into public.purchase_order_receipts (id, purchase_order_id, purchase_order_line_id,
    inventory_transaction_id, quantity, goods_total_cost, expected_total_cost,
    cost_variance_reason, delivery_reference, received_on, received_by, idempotency_key, command_payload)
  values (v_id, v_order.id, v_line.id, v_transaction_id, p_quantity, v_cost, v_expected,
    case when v_cost <> v_expected then trim(p_cost_variance_reason) else null end,
    trim(p_delivery_reference), p_received_on, v_actor, p_idempotency_key, v_payload);
  update public.purchase_order_lines set received_quantity = received_quantity + p_quantity where id = v_line.id;
  update public.purchase_orders set status = case when exists (
    select 1 from public.purchase_order_lines
    where purchase_order_id = v_order.id and received_quantity < ordered_quantity
  ) then 'partially_received' else 'received' end, updated_at = now() where id = v_order.id;
  return v_id;
end;
$$;

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

revoke execute on function public.receive_purchase_order_line(uuid,uuid,numeric,numeric,text,date,text),
  public.get_warehouse_receivable_po_lines() from public, anon;
grant execute on function public.receive_purchase_order_line(uuid,uuid,numeric,numeric,text,date,text),
  public.get_warehouse_receivable_po_lines() to authenticated;
