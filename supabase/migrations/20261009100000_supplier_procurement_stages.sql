-- Optional sourcing context for purchase orders, formal supplier quotations,
-- and an independent inspection before new supplier deliveries enter stock.
begin;

create table public.supplier_quotations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  reference text not null check (char_length(trim(reference)) between 2 and 120),
  quoted_on date not null,
  valid_until date check (valid_until is null or valid_until >= quoted_on),
  notes text check (notes is null or char_length(notes) <= 500),
  total numeric(18,2) not null check (total > 0),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  command_payload jsonb not null,
  created_at timestamptz not null default now()
);
create unique index supplier_quotations_reference_idx on public.supplier_quotations(supplier_id,lower(trim(reference)));
create table public.supplier_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.supplier_quotations(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  quantity numeric(20,4) not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price > 0),
  unique (quotation_id, material_id)
);
create index supplier_quotations_recent_idx on public.supplier_quotations(quoted_on desc,id);
create index supplier_quotation_lines_material_idx on public.supplier_quotation_lines(material_id,quotation_id);

-- A purchase can be warehouse restocking, request-led, quote-led, or both.
-- This records provenance without implying that procurement has fulfilled a
-- site request. Fulfillment still happens only through dispatch/site receipt.
create table public.purchase_procurement_context (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  material_request_id uuid references public.material_requests(id) on delete restrict,
  supplier_quotation_id uuid references public.supplier_quotations(id) on delete restrict,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index purchase_procurement_request_idx on public.purchase_procurement_context(material_request_id)
  where material_request_id is not null;
create index purchase_procurement_quote_idx on public.purchase_procurement_context(supplier_quotation_id)
  where supplier_quotation_id is not null;

-- Existing orders/receipts are grandfathered. Newly issued POs must pass an
-- inspected accepted quantity before receipt stock is posted.
alter table public.purchase_orders add column inspection_required boolean not null default false;
alter table public.purchase_orders alter column inspection_required set default true;
create table public.purchase_delivery_inspections (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  delivery_reference text not null check (char_length(trim(delivery_reference)) between 2 and 120),
  inspected_on date not null,
  delivered_quantity numeric(20,4) not null check (delivered_quantity > 0),
  accepted_quantity numeric(20,4) not null check (accepted_quantity >= 0 and accepted_quantity <= delivered_quantity),
  quality_note text check (quality_note is null or char_length(trim(quality_note)) between 3 and 500),
  inspected_by uuid not null references public.profiles(id) on delete restrict,
  command_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint purchase_inspection_note check (accepted_quantity = delivered_quantity or quality_note is not null)
);
create index purchase_inspections_line_idx on public.purchase_delivery_inspections(purchase_order_line_id,created_at desc);
alter table public.purchase_order_receipts add column inspection_id uuid unique
  references public.purchase_delivery_inspections(id) on delete restrict;

alter table public.supplier_quotations enable row level security;
alter table public.supplier_quotation_lines enable row level security;
alter table public.purchase_procurement_context enable row level security;
alter table public.purchase_delivery_inspections enable row level security;
revoke all on public.supplier_quotations,public.supplier_quotation_lines,
  public.purchase_procurement_context,public.purchase_delivery_inspections from public,anon,authenticated;
grant select on public.supplier_quotations,public.supplier_quotation_lines,
  public.purchase_procurement_context,public.purchase_delivery_inspections to authenticated;
create policy supplier_quotations_finance_read on public.supplier_quotations for select to authenticated
  using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
create policy supplier_quotation_lines_finance_read on public.supplier_quotation_lines for select to authenticated
  using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
create policy purchase_procurement_context_finance_read on public.purchase_procurement_context for select to authenticated
  using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
create policy purchase_delivery_inspections_read on public.purchase_delivery_inspections for select to authenticated
  using (exists(select 1 from public.purchase_order_lines l join public.purchase_orders o on o.id=l.purchase_order_id
    where l.id=purchase_order_line_id and (private.has_any_role(array['admin','finance']::public.app_role[])
      or (private.has_any_role(array['warehouse_staff']::public.app_role[]) and private.can_access_warehouse(o.warehouse_id)))));
create trigger supplier_quotations_audit after insert on public.supplier_quotations for each row execute function private.audit_row_change();
create trigger supplier_quotation_lines_audit after insert on public.supplier_quotation_lines for each row execute function private.audit_row_change();
create trigger purchase_procurement_context_audit after insert on public.purchase_procurement_context for each row execute function private.audit_row_change();
create trigger purchase_delivery_inspections_audit after insert on public.purchase_delivery_inspections for each row execute function private.audit_row_change();

create function public.record_supplier_quotation(
  p_idempotency_key uuid,p_supplier_id uuid,p_reference text,p_quoted_on date,
  p_valid_until date,p_notes text,p_lines jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid(); v_payload jsonb; v_existing public.supplier_quotations;
  v_id uuid; v_line jsonb; v_total numeric; v_material public.materials;
  v_notes text := nullif(trim(coalesce(p_notes,'')),'');
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can record supplier quotations' using errcode='42501';
  end if;
  if p_idempotency_key is null or p_supplier_id is null or p_quoted_on is null
    or char_length(trim(coalesce(p_reference,''))) not between 2 and 120
    or (p_valid_until is not null and p_valid_until < p_quoted_on)
    or (v_notes is not null and char_length(v_notes)>500) then
    raise exception 'Invalid supplier quotation' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('supplier',p_supplier_id,'reference',trim(p_reference),
    'quoted_on',p_quoted_on,'valid_until',p_valid_until,'notes',v_notes,'lines',p_lines);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_existing from public.supplier_quotations where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.recorded_by<>v_actor or v_existing.command_payload<>v_payload then
      raise exception 'Idempotency key already used for another quotation' using errcode='23505';
    end if;
    return v_existing.id;
  end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and status='active' and archived_at is null) then
    raise exception 'Supplier is not active' using errcode='22023';
  end if;
  v_total := private.purchase_input_total(p_lines);
  insert into public.supplier_quotations(idempotency_key,supplier_id,reference,quoted_on,valid_until,
    notes,total,recorded_by,command_payload)
  values(p_idempotency_key,p_supplier_id,trim(p_reference),p_quoted_on,p_valid_until,
    v_notes,v_total,v_actor,v_payload) returning id into v_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_material from public.materials where id=(v_line->>'materialId')::uuid;
    insert into public.supplier_quotation_lines(quotation_id,material_id,unit_of_measure_id,quantity,unit_price)
    values(v_id,v_material.id,v_material.base_unit_id,(v_line->>'quantity')::numeric,(v_line->>'unitPrice')::numeric);
  end loop;
  return v_id;
end; $$;
revoke all on function public.record_supplier_quotation(uuid,uuid,text,date,date,text,jsonb) from public,anon;
grant execute on function public.record_supplier_quotation(uuid,uuid,text,date,date,text,jsonb) to authenticated;

create function public.list_supplier_quotation_lines(
  p_search text default '',p_material_id uuid default null,p_offset integer default 0,p_limit integer default 20
) returns table(quotation_id uuid,supplier_id uuid,supplier_name text,reference text,
  quoted_on date,valid_until date,material_id uuid,material_name text,unit_symbol text,
  quantity numeric,unit_price numeric,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.has_any_role(array['admin','finance']::public.app_role[]) then
    raise exception 'Not authorized to view quotations' using errcode='42501';
  end if;
  if p_search is null or char_length(p_search)>100 or p_offset is null or p_offset<0
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid quotation search page' using errcode='22023';
  end if;
  return query select q.id,s.id,s.supplier_name,q.reference,q.quoted_on,q.valid_until,
    m.id,m.name,u.symbol,l.quantity,l.unit_price,count(*) over()
  from public.supplier_quotations q
  join public.suppliers s on s.id=q.supplier_id
  join public.supplier_quotation_lines l on l.quotation_id=q.id
  join public.materials m on m.id=l.material_id
  join public.units_of_measure u on u.id=l.unit_of_measure_id
  where (p_material_id is null or m.id=p_material_id)
    and concat_ws(' ',q.reference,s.supplier_name,m.code,m.name) ilike '%' ||
      replace(replace(replace(trim(p_search),'\','\\'),'%','\%'),'_','\_') || '%'
  order by case when p_material_id is not null then l.unit_price end asc nulls last,
    q.quoted_on desc,q.id,l.id limit p_limit offset p_offset;
end; $$;
revoke all on function public.list_supplier_quotation_lines(text,uuid,integer,integer) from public,anon;
grant execute on function public.list_supplier_quotation_lines(text,uuid,integer,integer) to authenticated;

create function public.submit_procurement_purchase(
  p_idempotency_key uuid,p_supplier_id uuid,p_warehouse_id uuid,
  p_ordered_on date,p_expected_on date,p_purpose text,p_lines jsonb,
  p_material_request_id uuid,p_supplier_quotation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid(); v_request public.material_requests;
  v_quote public.supplier_quotations; v_lines jsonb; v_result jsonb;
  v_context public.purchase_procurement_context;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can submit a purchase' using errcode='42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Purchase retry key is required' using errcode='22023';
  end if;
  -- The amount gate still uses the authoritative numeric validator.
  perform private.purchase_input_total(p_lines);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_context from public.purchase_procurement_context where idempotency_key=p_idempotency_key;
  if found and (v_context.recorded_by<>v_actor or
    v_context.material_request_id is distinct from p_material_request_id or
    v_context.supplier_quotation_id is distinct from p_supplier_quotation_id) then
    raise exception 'Idempotency key already used with different sourcing' using errcode='23505';
  end if;
  if found then
    -- Preserve retries even when a linked request is cancelled or a quote
    -- expires after the original purchase was submitted.
    return public.submit_purchase_order(p_idempotency_key,p_supplier_id,p_warehouse_id,
      p_ordered_on,p_expected_on,p_purpose,p_lines);
  end if;
  if exists(select 1 from public.purchase_orders where idempotency_key=p_idempotency_key)
    or exists(select 1 from public.purchase_approval_requests where idempotency_key=p_idempotency_key) then
    raise exception 'Idempotency key already used without this sourcing context' using errcode='23505';
  end if;
  if p_material_request_id is not null then
    select * into v_request from public.material_requests where id=p_material_request_id;
    if not found or v_request.source_warehouse_id<>p_warehouse_id then
      raise exception 'Material request is unavailable for this warehouse' using errcode='22023';
    end if;
    if v_request.status not in ('approved','partially_approved') then
      raise exception 'Linked material request requires Engineer approval before purchasing' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_lines) l
      where not exists(select 1 from public.material_request_lines rl
        where rl.request_id=p_material_request_id and rl.material_id=(l.value->>'materialId')::uuid)) then
      raise exception 'Purchase includes a material outside the linked request' using errcode='22023';
    end if;
  end if;
  if p_supplier_quotation_id is not null then
    select * into v_quote from public.supplier_quotations where id=p_supplier_quotation_id;
    if not found or v_quote.supplier_id<>p_supplier_id or v_quote.quoted_on>p_ordered_on
      or (v_quote.valid_until is not null and v_quote.valid_until<p_ordered_on) then
      raise exception 'Supplier quotation is not valid for this purchase' using errcode='22023';
    end if;
    select jsonb_agg(jsonb_build_object('materialId',material_id,'quantity',quantity,'unitPrice',unit_price)
      order by material_id) into v_lines from public.supplier_quotation_lines where quotation_id=p_supplier_quotation_id;
    if (select jsonb_agg(jsonb_build_object('materialId',(l.value->>'materialId')::uuid,
      'quantity',(l.value->>'quantity')::numeric,'unitPrice',(l.value->>'unitPrice')::numeric)
      order by (l.value->>'materialId')::uuid) from jsonb_array_elements(p_lines) l) is distinct from v_lines then
      raise exception 'Purchase items must match the selected quotation' using errcode='22023';
    end if;
  end if;
  insert into public.purchase_procurement_context(idempotency_key,material_request_id,supplier_quotation_id,recorded_by)
  values(p_idempotency_key,p_material_request_id,p_supplier_quotation_id,v_actor);
  v_result := public.submit_purchase_order(p_idempotency_key,p_supplier_id,p_warehouse_id,
    p_ordered_on,p_expected_on,p_purpose,p_lines);
  return v_result;
end; $$;
revoke all on function public.submit_procurement_purchase(uuid,uuid,uuid,date,date,text,jsonb,uuid,uuid) from public,anon;
grant execute on function public.submit_procurement_purchase(uuid,uuid,uuid,date,date,text,jsonb,uuid,uuid) to authenticated;

create function public.inspect_purchase_delivery(
  p_idempotency_key uuid,p_line_id uuid,p_delivered_quantity numeric,p_accepted_quantity numeric,
  p_delivery_reference text,p_inspected_on date,p_quality_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid(); v_order public.purchase_orders; v_line public.purchase_order_lines;
  v_existing public.purchase_delivery_inspections; v_payload jsonb; v_id uuid;
  v_note text := nullif(trim(coalesce(p_quality_note,'')),''); v_open numeric;
begin
  if v_actor is null or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
    raise exception 'Only Admin or assigned warehouse staff can inspect a purchase delivery' using errcode='42501';
  end if;
  if p_idempotency_key is null or p_line_id is null or p_inspected_on is null
    or p_inspected_on>(now() at time zone 'Asia/Manila')::date
    or char_length(trim(coalesce(p_delivery_reference,''))) not between 2 and 120
    or p_delivered_quantity is null or p_accepted_quantity is null
    or p_delivered_quantity<=0 or p_accepted_quantity<0 or p_accepted_quantity>p_delivered_quantity
    or (p_accepted_quantity<p_delivered_quantity and (v_note is null or char_length(v_note) not between 3 and 500))
    or (v_note is not null and char_length(v_note)>500) then
    raise exception 'Invalid purchase delivery inspection' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('line',p_line_id,'delivered',p_delivered_quantity,
    'accepted',p_accepted_quantity,'reference',trim(p_delivery_reference),
    'inspected_on',p_inspected_on,'note',v_note);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into v_existing from public.purchase_delivery_inspections where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.inspected_by<>v_actor or v_existing.command_payload<>v_payload then
      raise exception 'Idempotency key already used for another inspection' using errcode='23505';
    end if;
    return v_existing.id;
  end if;
  select o.* into v_order from public.purchase_orders o join public.purchase_order_lines l on l.purchase_order_id=o.id
    where l.id=p_line_id for update of o;
  if not found or v_order.status not in ('issued','partially_received')
    or not private.can_access_warehouse(v_order.warehouse_id) then
    raise exception 'Purchase order warehouse is not available to inspect' using errcode='42501';
  end if;
  select * into v_line from public.purchase_order_lines where id=p_line_id;
  perform private.validate_inventory_quantity(p_delivered_quantity,v_line.unit_of_measure_id);
  if p_accepted_quantity>0 then perform private.validate_inventory_quantity(p_accepted_quantity,v_line.unit_of_measure_id); end if;
  if p_inspected_on<v_order.ordered_on then
    raise exception 'Inspection predates the purchase order' using errcode='22023';
  end if;
  select coalesce(sum(i.accepted_quantity),0) into v_open from public.purchase_delivery_inspections i
    where i.purchase_order_line_id=p_line_id and i.accepted_quantity>0
      and not exists(select 1 from public.purchase_order_receipts r where r.inspection_id=i.id);
  if p_accepted_quantity+v_open>v_line.ordered_quantity-v_line.received_quantity then
    raise exception 'Accepted quantity exceeds the remaining purchase order quantity' using errcode='22023';
  end if;
  if exists(select 1 from public.purchase_delivery_inspections i
    where i.purchase_order_line_id=p_line_id and lower(i.delivery_reference)=lower(trim(p_delivery_reference))
      and not exists(select 1 from public.purchase_order_receipts r where r.inspection_id=i.id)) then
    raise exception 'Delivery reference already has an open inspection' using errcode='23505';
  end if;
  insert into public.purchase_delivery_inspections(idempotency_key,purchase_order_line_id,
    delivery_reference,inspected_on,delivered_quantity,accepted_quantity,quality_note,inspected_by,command_payload)
  values(p_idempotency_key,p_line_id,trim(p_delivery_reference),p_inspected_on,
    p_delivered_quantity,p_accepted_quantity,v_note,v_actor,v_payload) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.inspect_purchase_delivery(uuid,uuid,numeric,numeric,text,date,text) from public,anon;
grant execute on function public.inspect_purchase_delivery(uuid,uuid,numeric,numeric,text,date,text) to authenticated;

create function private.require_purchase_delivery_inspection() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_required boolean; v_inspection public.purchase_delivery_inspections;
begin
  select inspection_required into v_required from public.purchase_orders where id=new.purchase_order_id;
  if not v_required then return new; end if;
  select * into v_inspection from public.purchase_delivery_inspections i
    where i.purchase_order_line_id=new.purchase_order_line_id
      and lower(i.delivery_reference)=lower(new.delivery_reference)
      and i.inspected_on=new.received_on and i.accepted_quantity=new.quantity
      and i.accepted_quantity>0
      and not exists(select 1 from public.purchase_order_receipts r where r.inspection_id=i.id)
    order by i.created_at desc,i.id desc limit 1 for update;
  if not found then
    raise exception 'Accepted delivery inspection is required before inventory receipt' using errcode='22023';
  end if;
  new.inspection_id:=v_inspection.id;
  return new;
end; $$;
revoke all on function private.require_purchase_delivery_inspection() from public,anon,authenticated;
create trigger purchase_receipts_inspection_guard before insert on public.purchase_order_receipts
  for each row execute function private.require_purchase_delivery_inspection();

create function public.get_open_purchase_inspections(p_line_ids uuid[])
returns table(id uuid,purchase_order_line_id uuid,delivery_reference text,inspected_on date,
  delivered_quantity numeric,accepted_quantity numeric,quality_note text,inspected_by uuid,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or p_line_ids is null or cardinality(p_line_ids)>100 then
    raise exception 'Invalid inspection lookup' using errcode='22023';
  end if;
  return query select i.id,i.purchase_order_line_id,i.delivery_reference,i.inspected_on,
    i.delivered_quantity,i.accepted_quantity,i.quality_note,i.inspected_by,i.created_at
  from public.purchase_delivery_inspections i
  join public.purchase_order_lines l on l.id=i.purchase_order_line_id
  join public.purchase_orders o on o.id=l.purchase_order_id
  where i.purchase_order_line_id=any(p_line_ids) and i.accepted_quantity>0
    and (private.has_any_role(array['admin']::public.app_role[])
      or (private.has_any_role(array['warehouse_staff']::public.app_role[]) and private.can_access_warehouse(o.warehouse_id)))
    and not exists(select 1 from public.purchase_order_receipts r where r.inspection_id=i.id)
  order by i.created_at,i.id;
end; $$;
revoke all on function public.get_open_purchase_inspections(uuid[]) from public,anon;
grant execute on function public.get_open_purchase_inspections(uuid[]) to authenticated;

notify pgrst,'reload schema';
commit;
