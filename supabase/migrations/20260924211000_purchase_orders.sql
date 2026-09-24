-- Purchase orders and valued partial receipts. Prices are snapshotted at issue;
-- receipts carry actual goods cost. Freight/tax allocation is not inferred.
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_name text not null,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  warehouse_code text not null,
  warehouse_name text not null,
  ordered_on date not null,
  expected_on date not null check (expected_on >= ordered_on),
  purpose text not null check (char_length(trim(purpose)) between 3 and 500),
  status text not null default 'issued' check (status in ('issued','partially_received','received','cancelled')),
  issued_by uuid not null references public.profiles(id) on delete restrict,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_cancel_pair check (
    (status <> 'cancelled' and cancelled_by is null and cancelled_at is null and cancellation_reason is null)
    or (status = 'cancelled' and cancelled_by is not null and cancelled_at is not null and char_length(trim(cancellation_reason)) between 3 and 500)
  )
);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id, created_at desc);
create index purchase_orders_status_idx on public.purchase_orders(status, created_at desc);
create index purchase_orders_warehouse_idx on public.purchase_orders(warehouse_id, created_at desc);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  supplier_material_id uuid not null references public.supplier_materials(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  material_code text not null,
  material_name text not null,
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  unit_symbol text not null,
  ordered_quantity numeric(20,4) not null check (ordered_quantity > 0),
  received_quantity numeric(20,4) not null default 0 check (received_quantity >= 0 and received_quantity <= ordered_quantity),
  unit_price numeric(18,2) not null check (unit_price > 0),
  supplier_price_id uuid not null references public.supplier_prices(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(purchase_order_id, material_id)
);
create index purchase_order_lines_order_idx on public.purchase_order_lines(purchase_order_id);

create table public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  inventory_transaction_id uuid not null unique references public.inventory_transactions(id) on delete restrict,
  quantity numeric(20,4) not null check (quantity > 0),
  goods_total_cost numeric(18,2) not null check (goods_total_cost > 0),
  expected_total_cost numeric(18,2) not null check (expected_total_cost >= 0),
  cost_variance_reason text,
  delivery_reference text not null check (char_length(trim(delivery_reference)) between 2 and 120),
  received_on date not null,
  received_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_variance_reason check (
    (goods_total_cost = expected_total_cost and cost_variance_reason is null)
    or (goods_total_cost <> expected_total_cost and char_length(trim(cost_variance_reason)) between 3 and 500)
  )
);
create index purchase_order_receipts_line_idx on public.purchase_order_receipts(purchase_order_line_id, created_at desc);
create unique index purchase_order_receipts_delivery_line_unique on public.purchase_order_receipts(purchase_order_line_id, lower(delivery_reference));

create sequence public.purchase_order_number_seq;
revoke all on sequence public.purchase_order_number_seq from public, anon, authenticated;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_receipts enable row level security;
revoke all on public.purchase_orders, public.purchase_order_lines, public.purchase_order_receipts from public, anon, authenticated;
grant select on public.purchase_orders, public.purchase_order_lines, public.purchase_order_receipts to authenticated;
create policy purchase_orders_finance_read on public.purchase_orders for select to authenticated
using ((select private.has_any_role(array['super_admin','owner','admin','accounting']::public.app_role[])));
create policy purchase_order_lines_finance_read on public.purchase_order_lines for select to authenticated
using ((select private.has_any_role(array['super_admin','owner','admin','accounting']::public.app_role[])));
create policy purchase_order_receipts_finance_read on public.purchase_order_receipts for select to authenticated
using ((select private.has_any_role(array['super_admin','owner','admin','accounting']::public.app_role[])));
create trigger purchase_orders_audit after insert or update on public.purchase_orders for each row execute function private.audit_row_change();
create trigger purchase_order_lines_audit after insert or update on public.purchase_order_lines for each row execute function private.audit_row_change();
create trigger purchase_order_receipts_audit after insert on public.purchase_order_receipts for each row execute function private.audit_row_change();

create function public.issue_purchase_order(
  p_idempotency_key uuid, p_supplier_id uuid, p_warehouse_id uuid,
  p_ordered_on date, p_expected_on date, p_purpose text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.purchase_orders;
  v_supplier public.suppliers;
  v_warehouse public.warehouses;
  v_order_id uuid := gen_random_uuid();
  v_line jsonb;
  v_catalog public.supplier_materials;
  v_material public.materials;
  v_unit public.units_of_measure;
  v_price public.supplier_prices;
  v_quantity numeric;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_actor is null or not private.has_any_role(array['super_admin','owner','admin']::public.app_role[]) then
    raise exception 'Only an administrator can issue a purchase order' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_supplier_id is null or p_warehouse_id is null
    or p_ordered_on is null or p_expected_on is null or p_expected_on < p_ordered_on
    or char_length(trim(coalesce(p_purpose, ''))) not between 3 and 500
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'Invalid purchase order details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('supplier', p_supplier_id, 'warehouse', p_warehouse_id,
    'ordered_on', p_ordered_on, 'expected_on', p_expected_on, 'purpose', trim(p_purpose), 'lines', p_lines);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.purchase_orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.issued_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another order' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_supplier from public.suppliers where id = p_supplier_id and status = 'active' and archived_at is null;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and status = 'active';
  if v_supplier.id is null or v_warehouse.id is null then
    raise exception 'Supplier or warehouse is not active' using errcode = '22023';
  end if;
  insert into public.purchase_orders (id, po_number, supplier_id, supplier_name, warehouse_id,
    warehouse_code, warehouse_name, ordered_on, expected_on, purpose, issued_by, idempotency_key, command_payload)
  values (v_order_id, 'PO-' || to_char(p_ordered_on, 'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0'),
    v_supplier.id, v_supplier.supplier_name, v_warehouse.id, v_warehouse.code, v_warehouse.name,
    p_ordered_on, p_expected_on, trim(p_purpose), v_actor, p_idempotency_key, v_payload);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or (v_line->>'supplierMaterialId') is null
      or (v_line->>'quantity') is null then
      raise exception 'Invalid purchase order line' using errcode = '22023';
    end if;
    select * into v_catalog from public.supplier_materials
    where id = (v_line->>'supplierMaterialId')::uuid and supplier_id = p_supplier_id
      and archived_at is null and availability_status in ('available','limited');
    if v_catalog.id is null or v_catalog.id = any(v_seen) then
      raise exception 'Catalog line unavailable or duplicated' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_catalog.id);
    select * into v_material from public.materials where id = v_catalog.material_id
      and base_unit_id = v_catalog.unit_of_measure_id and is_active and archived_at is null
      and material_kind = 'consumable';
    select * into v_unit from public.units_of_measure where id = v_catalog.unit_of_measure_id and is_active;
    if v_material.id is null or v_unit.id is null then
      raise exception 'Catalog material or unit is not active' using errcode = '22023';
    end if;
    v_quantity := (v_line->>'quantity')::numeric;
    perform private.validate_inventory_quantity(v_quantity, v_unit.id);
    if v_quantity < v_catalog.minimum_order_quantity then
      raise exception 'Quantity is below the supplier minimum' using errcode = '22023';
    end if;
    select * into v_price from public.supplier_prices sp
    where sp.supplier_material_id = v_catalog.id and sp.currency = 'PHP'
      and sp.effective_start_date <= p_ordered_on
      and (sp.effective_end_date is null or sp.effective_end_date >= p_ordered_on)
    order by sp.effective_start_date desc, sp.created_at desc limit 1;
    if v_price.id is null then
      raise exception 'No active PHP price for a purchase order line' using errcode = '22023';
    end if;
    insert into public.purchase_order_lines (purchase_order_id, supplier_material_id, material_id,
      material_code, material_name, unit_of_measure_id, unit_symbol, ordered_quantity, unit_price, supplier_price_id)
    values (v_order_id, v_catalog.id, v_material.id, v_material.code, v_material.name,
      v_unit.id, v_unit.symbol, v_quantity, v_price.unit_price, v_price.id);
  end loop;
  return v_order_id;
end;
$$;

create function public.receive_purchase_order_line(
  p_idempotency_key uuid, p_line_id uuid, p_quantity numeric,
  p_goods_total_cost numeric, p_delivery_reference text, p_received_on date,
  p_cost_variance_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.purchase_order_receipts;
  v_order public.purchase_orders;
  v_line public.purchase_order_lines;
  v_location_id uuid;
  v_expected numeric(18,2);
  v_transaction_id uuid;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not private.has_any_role(array['super_admin','owner','admin']::public.app_role[]) then
    raise exception 'Only an administrator can post valued purchase receipts' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_line_id is null or p_received_on is null
    or p_quantity is null or p_quantity <= 0 or p_goods_total_cost is null or p_goods_total_cost <= 0
    or p_goods_total_cost <> round(p_goods_total_cost, 2)
    or char_length(trim(coalesce(p_delivery_reference, ''))) not between 2 and 120 then
    raise exception 'Invalid purchase receipt' using errcode = '22023';
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
  select * into v_line from public.purchase_order_lines where id = p_line_id for update;
  perform private.validate_inventory_quantity(p_quantity, v_line.unit_of_measure_id);
  if p_received_on < v_order.ordered_on or v_line.received_quantity + p_quantity > v_line.ordered_quantity then
    raise exception 'Receipt exceeds ordered quantity or predates the order' using errcode = '22023';
  end if;
  v_expected := round(p_quantity * v_line.unit_price, 2);
  if p_goods_total_cost <> v_expected and char_length(trim(coalesce(p_cost_variance_reason, ''))) not between 3 and 500 then
    raise exception 'Explain the difference from the PO goods price' using errcode = '22023';
  end if;
  if p_goods_total_cost = v_expected and nullif(trim(coalesce(p_cost_variance_reason, '')), '') is not null then
    raise exception 'Cost variance reason is only for a changed cost' using errcode = '22023';
  end if;
  select id into v_location_id from public.inventory_locations where warehouse_id = v_order.warehouse_id;
  if v_location_id is null then raise exception 'Warehouse has no inventory location' using errcode = '22023'; end if;
  v_transaction_id := private.post_valued_stock_in_core(v_actor, v_line.material_id, v_location_id,
    p_quantity, v_line.unit_of_measure_id, p_goods_total_cost,
    left(v_order.po_number || ' / ' || trim(p_delivery_reference), 120), p_received_on,
    case when p_goods_total_cost <> v_expected then trim(p_cost_variance_reason) else null end);
  insert into public.purchase_order_receipts (id, purchase_order_id, purchase_order_line_id,
    inventory_transaction_id, quantity, goods_total_cost, expected_total_cost,
    cost_variance_reason, delivery_reference, received_on, received_by, idempotency_key, command_payload)
  values (v_id, v_order.id, v_line.id, v_transaction_id, p_quantity, p_goods_total_cost, v_expected,
    case when p_goods_total_cost <> v_expected then trim(p_cost_variance_reason) else null end,
    trim(p_delivery_reference), p_received_on, v_actor, p_idempotency_key, v_payload);
  update public.purchase_order_lines set received_quantity = received_quantity + p_quantity where id = v_line.id;
  update public.purchase_orders set status = case when exists (
    select 1 from public.purchase_order_lines
    where purchase_order_id = v_order.id and received_quantity < ordered_quantity
  ) then 'partially_received' else 'received' end, updated_at = now() where id = v_order.id;
  return v_id;
end;
$$;

create function public.cancel_purchase_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_order public.purchase_orders;
begin
  if v_actor is null or not private.has_any_role(array['super_admin','owner','admin']::public.app_role[]) then
    raise exception 'Only an administrator can cancel purchase orders' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Purchase order not found' using errcode = '22023'; end if;
  if v_order.status = 'cancelled' then return; end if;
  if v_order.status <> 'issued' or exists(select 1 from public.purchase_order_receipts where purchase_order_id = p_order_id) then
    raise exception 'A received order cannot be cancelled; use a valued correction' using errcode = '22023';
  end if;
  update public.purchase_orders set status = 'cancelled', cancelled_by = v_actor,
    cancelled_at = now(), cancellation_reason = trim(p_reason), updated_at = now() where id = p_order_id;
end;
$$;

revoke execute on function public.issue_purchase_order(uuid,uuid,uuid,date,date,text,jsonb) from public, anon;
revoke execute on function public.receive_purchase_order_line(uuid,uuid,numeric,numeric,text,date,text) from public, anon;
revoke execute on function public.cancel_purchase_order(uuid,text) from public, anon;
grant execute on function public.issue_purchase_order(uuid,uuid,uuid,date,date,text,jsonb) to authenticated;
grant execute on function public.receive_purchase_order_line(uuid,uuid,numeric,numeric,text,date,text) to authenticated;
grant execute on function public.cancel_purchase_order(uuid,text) to authenticated;
