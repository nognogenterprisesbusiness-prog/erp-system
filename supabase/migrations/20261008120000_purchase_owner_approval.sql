-- Purchases over PHP 50,000 wait for an explicit Admin (owner) decision.
-- Pending requests are not purchase orders and do not update supplier prices.
create table public.purchase_approval_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_payload jsonb not null,
  order_total numeric(18,2) not null check (order_total > 50000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text,
  purchase_order_id uuid unique references public.purchase_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint purchase_approval_decision_pair check (
    (status = 'pending' and decided_by is null and decided_at is null and decision_reason is null and purchase_order_id is null)
    or (status = 'approved' and decided_by is not null and decided_at is not null)
    or (status = 'rejected' and decided_by is not null and decided_at is not null
      and char_length(trim(decision_reason)) between 3 and 500 and purchase_order_id is null)
  )
);
create index purchase_approval_requests_queue_idx on public.purchase_approval_requests(status, created_at desc);
alter table public.purchase_approval_requests enable row level security;
revoke all on public.purchase_approval_requests from public, anon, authenticated;
grant select on public.purchase_approval_requests to authenticated;
create policy purchase_approval_requests_read on public.purchase_approval_requests
for select to authenticated using ((select private.has_any_role(array['admin','finance']::public.app_role[])));
create trigger purchase_approval_requests_audit
after insert or update on public.purchase_approval_requests for each row
execute function private.audit_row_change();

create or replace function private.purchase_input_total(p_lines jsonb)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare
  v_line jsonb;
  v_material public.materials;
  v_unit public.units_of_measure;
  v_seen uuid[] := '{}'::uuid[];
  v_quantity numeric;
  v_price numeric;
  v_total numeric := 0;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'Invalid purchase order lines' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or (v_line->>'materialId') is null
      or (v_line->>'quantity') is null or (v_line->>'unitPrice') is null then
      raise exception 'Invalid purchase order line' using errcode = '22023';
    end if;
    select * into v_material from public.materials where id=(v_line->>'materialId')::uuid
      and is_active and archived_at is null and material_kind='consumable';
    if v_material.id is null then raise exception 'Material is not active' using errcode = '22023'; end if;
    select * into v_unit from public.units_of_measure where id=v_material.base_unit_id and is_active;
    if v_unit.id is null then raise exception 'Unit is not active' using errcode = '22023'; end if;
    if v_material.id = any(v_seen) then raise exception 'Choose each material once' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_material.id);
    v_quantity := (v_line->>'quantity')::numeric;
    perform private.validate_inventory_quantity(v_quantity, v_unit.id);
    v_price := (v_line->>'unitPrice')::numeric;
    if v_price <= 0 or v_price <> round(v_price, 2) then
      raise exception 'Enter a unit price greater than zero with up to two decimals' using errcode = '22023';
    end if;
    v_total := v_total + round(v_quantity * v_price, 2);
    if v_total > 9999999999999999.99 then raise exception 'Purchase amount is too large' using errcode = '22023'; end if;
  end loop;
  return v_total;
end; $$;
revoke execute on function private.purchase_input_total(jsonb) from public, anon, authenticated;

-- This deferred guard protects the existing issue_purchase_order RPC as well as
-- the new UI. All line writes and supplier-price writes roll back on denial.
create or replace function private.require_purchase_owner_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders;
  v_total numeric;
begin
  select * into v_order from public.purchase_orders where id=new.purchase_order_id for update;
  select coalesce(sum(round(ordered_quantity * unit_price, 2)), 0) into v_total
    from public.purchase_order_lines where purchase_order_id=new.purchase_order_id;
  if v_total > 50000 and not exists (
    select 1 from public.purchase_approval_requests a
    where a.idempotency_key=v_order.idempotency_key
      and a.request_payload=v_order.command_payload
      and a.order_total=v_total
      and a.status='approved'
      and a.purchase_order_id=v_order.id
  ) then
    raise exception 'Owner approval is required above PHP 50,000' using errcode = '42501';
  end if;
  return null;
end; $$;
revoke execute on function private.require_purchase_owner_approval() from public, anon, authenticated;
create constraint trigger purchase_order_lines_owner_approval
after insert or update of ordered_quantity, unit_price on public.purchase_order_lines
deferrable initially deferred for each row execute function private.require_purchase_owner_approval();

create or replace function public.submit_purchase_order(
  p_idempotency_key uuid, p_supplier_id uuid, p_warehouse_id uuid,
  p_ordered_on date, p_expected_on date, p_purpose text, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_total numeric;
  v_existing public.purchase_approval_requests;
  v_order public.purchase_orders;
  v_order_id uuid;
  v_purpose text := nullif(trim(coalesce(p_purpose, '')), '');
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can submit a purchase' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_supplier_id is null or p_warehouse_id is null or p_ordered_on is null
    or (p_expected_on is not null and p_expected_on < p_ordered_on)
    or (v_purpose is not null and char_length(v_purpose) not between 3 and 500) then
    raise exception 'Invalid purchase order details' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('supplier',p_supplier_id,'warehouse',p_warehouse_id,
    'ordered_on',p_ordered_on,'expected_on',p_expected_on,'purpose',v_purpose,'lines',p_lines);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.purchase_approval_requests where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.requested_by<>v_actor or v_existing.request_payload<>v_payload then
      raise exception 'Idempotency key already used for another purchase' using errcode='23505';
    end if;
    return jsonb_build_object('kind',case when v_existing.purchase_order_id is null then v_existing.status else 'issued' end,
      'id',coalesce(v_existing.purchase_order_id,v_existing.id));
  end if;
  select * into v_order from public.purchase_orders where idempotency_key=p_idempotency_key;
  if found then
    if v_order.issued_by<>v_actor or v_order.command_payload<>v_payload then
      raise exception 'Idempotency key already used for another purchase' using errcode='23505';
    end if;
    return jsonb_build_object('kind','issued','id',v_order.id);
  end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and status='active' and archived_at is null)
    or not exists(select 1 from public.warehouses where id=p_warehouse_id and status='active') then
    raise exception 'Supplier or warehouse is not active' using errcode='22023';
  end if;
  v_total := private.purchase_input_total(p_lines);
  if v_total <= 50000 then
    v_order_id := public.issue_purchase_order(p_idempotency_key,p_supplier_id,p_warehouse_id,
      p_ordered_on,p_expected_on,v_purpose,p_lines);
    return jsonb_build_object('kind','issued','id',v_order_id);
  end if;
  insert into public.purchase_approval_requests(idempotency_key,request_payload,order_total,requested_by)
    values(p_idempotency_key,v_payload,v_total,v_actor)
    returning id into v_order_id;
  return jsonb_build_object('kind','pending','id',v_order_id);
end; $$;
revoke execute on function public.submit_purchase_order(uuid,uuid,uuid,date,date,text,jsonb) from public, anon;
grant execute on function public.submit_purchase_order(uuid,uuid,uuid,date,date,text,jsonb) to authenticated;

create or replace function public.decide_purchase_owner_approval(
  p_request_id uuid, p_approve boolean, p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_request public.purchase_approval_requests;
  v_order_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason,'')), '');
  v_payload jsonb;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can approve a purchase' using errcode='42501';
  end if;
  if p_request_id is null or p_approve is null or
    (not p_approve and (v_reason is null or char_length(v_reason) not between 3 and 500))
    or (p_approve and v_reason is not null and char_length(v_reason)>500) then
    raise exception 'Invalid purchase decision' using errcode='22023';
  end if;
  select * into v_request from public.purchase_approval_requests where id=p_request_id for update;
  if not found then raise exception 'Purchase request not found' using errcode='22023'; end if;
  if v_request.status<>'pending' then
    if v_request.decided_by=v_actor and
      ((p_approve and v_request.status='approved') or
       (not p_approve and v_request.status='rejected' and v_request.decision_reason=v_reason)) then
      return v_request.purchase_order_id;
    end if;
    raise exception 'Purchase already decided' using errcode='23505';
  end if;
  if not p_approve then
    update public.purchase_approval_requests set status='rejected',decided_by=v_actor,
      decided_at=now(),decision_reason=v_reason where id=p_request_id;
    return null;
  end if;
  v_payload := v_request.request_payload;
  if private.purchase_input_total(v_payload->'lines') <> v_request.order_total then
    raise exception 'Purchase amount changed since submission' using errcode='22023';
  end if;
  update public.purchase_approval_requests set status='approved',decided_by=v_actor,
    decided_at=now(),decision_reason=v_reason where id=p_request_id;
  v_order_id := public.issue_purchase_order(v_request.idempotency_key,
    (v_payload->>'supplier')::uuid,(v_payload->>'warehouse')::uuid,
    (v_payload->>'ordered_on')::date,(v_payload->>'expected_on')::date,
    v_payload->>'purpose',v_payload->'lines');
  update public.purchase_approval_requests set purchase_order_id=v_order_id where id=p_request_id;
  return v_order_id;
end; $$;
revoke execute on function public.decide_purchase_owner_approval(uuid,boolean,text) from public, anon;
grant execute on function public.decide_purchase_owner_approval(uuid,boolean,text) to authenticated;
