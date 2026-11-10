-- One request may reserve each material from multiple real warehouses.
begin;
alter table public.material_requests drop constraint material_request_approved_source;
create function private.check_request_approved_sources() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('approved','partially_approved') and new.source_warehouse_id is null then
   if (select count(distinct loc.warehouse_id) from public.material_request_reservations a join public.material_request_lines l on l.id=a.request_line_id join public.inventory_locations loc on loc.id=a.inventory_location_id where l.request_id=new.id)<2
     or exists(select 1 from public.material_request_lines l where l.request_id=new.id and l.approved_quantity<>coalesce((select sum(a.original_quantity) from public.material_request_reservations a where a.request_line_id=l.id),0)) then
     raise exception 'Approved request requires a source or complete warehouse allocations' using errcode='23514';
   end if;
 end if;
 return new;
end; $$;
revoke all on function private.check_request_approved_sources() from public,anon,authenticated;
create trigger material_request_approved_sources before insert or update on public.material_requests for each row execute function private.check_request_approved_sources();
alter table public.material_request_reservations drop constraint material_request_reservations_request_line_id_key;
alter table public.material_request_reservations add constraint material_request_reservations_line_location_key unique(request_line_id,inventory_location_id);
alter table public.material_request_dispatches add column reservation_id uuid references public.material_request_reservations(id);
update public.material_request_dispatches d set reservation_id=res.id from public.material_request_reservations res where res.request_line_id=d.request_line_id;
create index material_request_dispatches_reservation_idx on public.material_request_dispatches(reservation_id);
create or replace function private.can_view_material_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.material_requests r where r.id=p_request_id and (
   private.can_access_project_site(r.project_id,r.project_site_id)
   or (private.has_any_role(array['warehouse_staff']::public.app_role[]) and (
     (r.status in ('submitted','approved','partially_approved') and (private.can_access_warehouse(r.source_warehouse_id) or exists(select 1 from public.material_request_lines line join public.material_request_reservations allocation on allocation.request_line_id=line.id join public.inventory_locations source on source.id=allocation.inventory_location_id where line.request_id=r.id and private.can_access_warehouse(source.warehouse_id))))
     or (r.status='submitted' and r.source_warehouse_id is null and exists(
       select 1 from public.project_warehouses pw join public.warehouses w on w.id=pw.warehouse_id
       where pw.project_id=r.project_id and w.status='active' and private.can_access_warehouse(w.id)))))));
$$;
create or replace function public.decide_material_request_sources(
  p_idempotency_key uuid, p_request_id uuid, p_decisions jsonb, p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request public.material_requests%rowtype;
  v_receipt public.material_request_decision_receipts%rowtype;
  v_hash text;
  v_line public.material_request_lines%rowtype;
  v_decision jsonb;
  v_qty numeric;
  v_alloc jsonb; v_warehouse uuid; v_alloc_qty numeric;
  v_location_id uuid;
  v_reservation_id uuid;
  v_available numeric;
  v_approved_count integer := 0;
  v_full_count integer := 0;
  v_status public.material_request_status;
begin
  if v_actor is null or p_idempotency_key is null or p_request_id is null then raise exception 'authentication and request are required' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required) then
    raise exception 'active account required' using errcode = '42501';
  end if;
  if length(coalesce(p_reason,''))>500 then raise exception 'Decision note must be at most 500 characters' using errcode='22023'; end if;
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'object' then raise exception 'invalid request decision' using errcode = '22023'; end if;
  select * into v_request from public.material_requests where id=p_request_id;
  if not found then raise exception 'request not found' using errcode='P0002'; end if;
  if not private.can_review_project_site(v_request.project_id,v_request.project_site_id) then
    raise exception 'assigned site engineer or admin approval required' using errcode='42501';
  end if;
  if v_request.requested_by=v_actor and not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'requesters cannot approve their own requests' using errcode='42501';
  end if;
  v_hash := md5(jsonb_build_object('request', p_request_id, 'allocations', p_decisions, 'reason', nullif(trim(coalesce(p_reason,'')),''))::text);
  select * into v_receipt from public.material_request_decision_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_id <> v_actor or v_receipt.request_id <> p_request_id or v_receipt.payload_hash <> v_hash then
      raise exception 'idempotency key was used for another decision' using errcode = '23505';
    end if;
    return p_request_id;
  end if;
  select * into v_request from public.material_requests where id = p_request_id for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  -- A concurrent retry may have committed while this call waited for the request lock.
  select * into v_receipt from public.material_request_decision_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_id <> v_actor or v_receipt.request_id <> p_request_id or v_receipt.payload_hash <> v_hash then
      raise exception 'idempotency key was used for another decision' using errcode = '23505';
    end if;
    return p_request_id;
  end if;
  if v_request.status <> 'submitted' then raise exception 'request is already decided' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_decisions)) <> (select count(*) from public.material_request_lines where request_id = p_request_id) then
    raise exception 'decision must cover every line' using errcode = '22023';
  end if;


  for v_line in select * from public.material_request_lines where request_id = p_request_id order by material_id for update loop
    v_decision := p_decisions -> v_line.id::text;
    if v_decision is null or jsonb_typeof(v_decision)<>'array' or jsonb_array_length(v_decision)>10 then
      raise exception 'Choose up to ten warehouse allocations per material' using errcode='22023';
    end if;
    if (select count(*) from jsonb_array_elements(v_decision))<>(select count(distinct x->>'warehouseId') from jsonb_array_elements(v_decision) x) then
      raise exception 'Choose each warehouse only once per material' using errcode='22023';
    end if;
    v_qty:=0;
    for v_alloc in select value from jsonb_array_elements(v_decision) order by value->>'warehouseId' loop
      if jsonb_typeof(v_alloc)<>'object' or coalesce(v_alloc->>'warehouseId','') !~ '^[0-9a-fA-F-]{36}$'
        or coalesce(v_alloc->>'quantity','') !~ '^[0-9]{1,10}(\.[0-9]{1,4})?$' then
        raise exception 'Invalid warehouse allocation' using errcode='22023';
      end if;
      v_warehouse:=(v_alloc->>'warehouseId')::uuid; v_alloc_qty:=(v_alloc->>'quantity')::numeric;
      if v_alloc_qty<=0 then raise exception 'Allocation quantity must be positive' using errcode='22023'; end if;
      perform private.validate_inventory_quantity(v_alloc_qty,v_line.unit_of_measure_id);
      if not exists(select 1 from public.warehouses w where w.id=v_warehouse and w.status='active')
        or not (private.can_access_warehouse(v_warehouse) or v_warehouse=v_request.source_warehouse_id) then
        raise exception 'Warehouse allocation is not authorized' using errcode='42501';
      end if;
      v_qty:=v_qty+v_alloc_qty;
      if v_qty>v_line.requested_quantity then raise exception 'approved quantity exceeds request' using errcode='22023'; end if;
      select id into v_location_id from public.inventory_locations where warehouse_id=v_warehouse;
      select available_quantity into v_available from public.inventory_balances where material_id=v_line.material_id and inventory_location_id=v_location_id for update;
      if coalesce(v_available,0)<v_alloc_qty then raise exception 'insufficient available stock to reserve for material %',v_line.material_id using errcode='P0001'; end if;
      update public.inventory_balances set reserved_quantity=reserved_quantity+v_alloc_qty,updated_at=now() where material_id=v_line.material_id and inventory_location_id=v_location_id;
      insert into public.material_request_reservations(request_line_id,material_id,inventory_location_id,original_quantity,remaining_quantity,reserved_by)
        values(v_line.id,v_line.material_id,v_location_id,v_alloc_qty,v_alloc_qty,v_actor) returning id into v_reservation_id;
      insert into public.material_request_reservation_events(reservation_id,event_type,quantity,actor_id) values(v_reservation_id,'reserved',v_alloc_qty,v_actor);
    end loop;
    if v_qty > 0 then v_approved_count := v_approved_count + 1; end if;
    if v_qty = v_line.requested_quantity then v_full_count := v_full_count + 1; end if;
    update public.material_request_lines set approved_quantity = v_qty where id = v_line.id;
  end loop;
  if v_approved_count = 0 then v_status := 'rejected';
  elsif v_full_count = (select count(*) from jsonb_object_keys(p_decisions)) then v_status := 'approved';
  else v_status := 'partially_approved'; end if;
  if v_status <> 'approved' and char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'reason is required when reducing or rejecting a request' using errcode = '22023';
  end if;
  update public.material_requests set
    source_warehouse_id=(select case when count(distinct loc.warehouse_id)=1 then min(loc.warehouse_id::text)::uuid end from public.material_request_reservations a join public.material_request_lines l on l.id=a.request_line_id join public.inventory_locations loc on loc.id=a.inventory_location_id where l.request_id=p_request_id),
    source_warehouse_name=coalesce((select case when count(distinct loc.warehouse_id)>1 then 'Multiple warehouses' else min(w.name) end from public.material_request_reservations a join public.material_request_lines l on l.id=a.request_line_id join public.inventory_locations loc on loc.id=a.inventory_location_id join public.warehouses w on w.id=loc.warehouse_id where l.request_id=p_request_id),'No stock allocated'),
    status = v_status, decided_by = v_actor, decided_at = now(),
    decision_reason = nullif(trim(coalesce(p_reason,'')),'') where id = p_request_id;
  insert into public.material_request_events (request_id, event_type, actor_id, details)
    values (p_request_id, v_status, v_actor, jsonb_build_object('approvedQuantities', p_decisions, 'reason', p_reason));
  perform private.enqueue_notification_event(
    'material-request-decided-' || p_request_id, 'MATERIAL_REQUEST', 'Material request decided',
    'Your material request was ' || replace(v_status::text, '_', ' ') || '.',
    'material_request', p_request_id, v_request.project_id, null, 'normal',
    '{}'::public.app_role[], array[v_request.requested_by], null
  );
  insert into public.material_request_decision_receipts (idempotency_key, request_id, actor_id, payload_hash)
    values (p_idempotency_key, p_request_id, v_actor, v_hash);
  return p_request_id;
end; $$;
revoke all on function public.decide_material_request_sources(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.decide_material_request_sources(uuid,uuid,jsonb,text) to authenticated;
create or replace function private.dispatch_request_allocation_core(
  p_idempotency_key uuid, p_reservation_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p_request_line_id uuid;
  v_warehouse uuid;
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_line public.material_request_lines%rowtype;
  v_request public.material_requests%rowtype;
  v_sent numeric;
  v_on_hand numeric;
  v_reserved numeric;
  v_reservation public.material_request_reservations%rowtype;
  v_source uuid;
  v_destination uuid;
  v_transfer_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_transaction_id uuid := gen_random_uuid();
  v_transfer_number text;
  v_hash text;
begin
  select request_line_id into p_request_line_id from public.material_request_reservations where id=p_reservation_id;
  if p_request_line_id is null then raise exception 'Allocation not found' using errcode='P0002'; end if;
  select loc.warehouse_id into v_warehouse from public.material_request_reservations a join public.inventory_locations loc on loc.id=a.inventory_location_id where a.id=p_reservation_id;
  if v_actor is null or p_idempotency_key is null or p_request_line_id is null or p_transaction_date is null then
    raise exception 'request line, date and idempotency key are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('allocation',p_reservation_id,'line', p_request_line_id, 'quantity', p_quantity,
    'date', p_transaction_date, 'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'dispatch_request_allocation', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_line from public.material_request_lines where id = p_request_line_id for update;
  if not found then raise exception 'request line not found' using errcode = 'P0002'; end if;
  -- A simultaneous retry may have posted while waiting for the line lock.
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'dispatch_request_allocation', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_request from public.material_requests where id = v_line.request_id;
  if v_request.status not in ('approved', 'partially_approved') then
    raise exception 'request is not approved' using errcode = '22023';
  end if;
  if p_transaction_date < v_request.requested_at::date then raise exception 'dispatch date precedes request' using errcode = '22023'; end if;
  if not private.can_manage_inventory() and not (
    private.has_any_role(array['warehouse_staff']::public.app_role[])
    and exists (select 1 from public.warehouse_assignments a where a.warehouse_id = v_warehouse
      and a.user_id = v_actor and a.status = 'active')
  ) then raise exception 'not authorized for source warehouse' using errcode = '42501'; end if;
  if not exists (select 1 from public.projects where id = v_request.project_id and status = 'active' and archived_at is null)
    or not exists (select 1 from public.project_sites where id = v_request.project_site_id and status = 'active')
    or not exists (select 1 from public.warehouses where id = v_warehouse and status = 'active')
 then
    raise exception 'project, site or warehouse is inactive' using errcode = '22023';
  end if;
  perform private.validate_inventory_quantity(p_quantity, v_line.unit_of_measure_id);
  perform private.validate_inventory_material(v_line.material_id, v_line.unit_of_measure_id);
  select coalesce(sum(ti.dispatched_quantity), 0) into v_sent
    from public.material_request_dispatches d join public.inventory_transfer_items ti on ti.id = d.transfer_item_id
    where d.request_line_id = v_line.id;
  if v_sent + p_quantity > v_line.approved_quantity then
    raise exception 'dispatch exceeds remaining approved quantity' using errcode = '22023';
  end if;
  select id into v_source from public.inventory_locations where warehouse_id = v_warehouse;
  select id into v_destination from public.inventory_locations where project_site_id = v_request.project_site_id;
  if v_source is null or v_destination is null then raise exception 'inventory location is missing' using errcode = 'P0002'; end if;
  select * into v_reservation from public.material_request_reservations
    where id = p_reservation_id and request_line_id=v_line.id for update;
  if v_reservation.id is null or v_reservation.status <> 'active'
    or v_reservation.remaining_quantity < p_quantity then
    raise exception 'dispatch exceeds remaining reserved quantity' using errcode = '22023';
  end if;
  select quantity_on_hand, reserved_quantity into v_on_hand, v_reserved from public.inventory_balances
    where material_id = v_line.material_id and inventory_location_id = v_source for update;
  if coalesce(v_on_hand, 0) < p_quantity or coalesce(v_reserved, 0) < p_quantity then
    raise exception 'reserved stock is unavailable' using errcode = 'P0001';
  end if;
  -- A retry that waited on the request-line lock must not post another movement.
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'dispatch_request_allocation', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  insert into public.inventory_transfers (id, source_location_id, destination_location_id,
    external_reference, dispatched_by, dispatched_at, remarks)
  values (v_transfer_id, v_source, v_destination, v_request.request_number,
    v_actor, p_transaction_date::timestamptz, nullif(trim(p_remarks), ''))
  returning transfer_number into v_transfer_number;
  insert into public.inventory_transfer_items (id, transfer_id, material_id, unit_of_measure_id, dispatched_quantity)
    values (v_item_id, v_transfer_id, v_line.material_id, v_line.unit_of_measure_id, p_quantity);
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity,
    reserved_quantity = reserved_quantity - p_quantity, updated_at = now()
    where material_id = v_line.material_id and inventory_location_id = v_source;
  update public.material_request_reservations
    set remaining_quantity = remaining_quantity - p_quantity,
      status = case when remaining_quantity = p_quantity then 'fulfilled' else 'active' end
    where id = v_reservation.id;
  insert into public.material_request_reservation_events (reservation_id, event_type, quantity, actor_id)
    values (v_reservation.id, 'dispatched', p_quantity, v_actor);
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id,
    source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id,
    transfer_phase, reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, v_line.material_id, p_quantity, v_line.unit_of_measure_id,
    v_source, v_destination, 'SITE_TRANSFER', v_transfer_id, v_item_id,
    'dispatch', v_transfer_number, v_request.project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.material_request_dispatches (request_line_id, transfer_item_id,reservation_id) values (v_line.id, v_item_id,p_reservation_id);
  insert into public.material_request_fulfillment_events (request_line_id, transfer_item_id, event_type, quantity, actor_id)
    values (v_line.id, v_item_id, 'dispatched', p_quantity, v_actor);
  perform private.enqueue_notification_event(
    'material-request-dispatch-' || v_item_id, 'MATERIAL_REQUEST', 'Materials dispatched',
    'Reserved materials were dispatched to the project site.', 'material_request', v_request.id,
    v_request.project_id, null, 'normal', '{}'::public.app_role[], array[v_request.requested_by], null
  );
  insert into public.material_request_fulfillment_receipts (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'dispatch_request_allocation', v_hash, v_transfer_id);
  return v_transfer_id;
end; $$;
revoke all on function private.dispatch_request_allocation_core(uuid,uuid,numeric,date,text) from public,anon,authenticated;
create or replace function public.dispatch_approved_request_line(
  p_idempotency_key uuid, p_request_line_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_line public.material_request_lines%rowtype;
  v_request public.material_requests%rowtype;
  v_sent numeric;
  v_on_hand numeric;
  v_reserved numeric;
  v_reservation public.material_request_reservations%rowtype;
  v_source uuid;
  v_destination uuid;
  v_transfer_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_transaction_id uuid := gen_random_uuid();
  v_transfer_number text;
  v_hash text;
begin
  if (select count(*) from public.material_request_reservations where request_line_id=p_request_line_id)>1
    or exists(select 1 from public.material_request_reservations a join public.inventory_locations loc on loc.id=a.inventory_location_id join public.material_request_lines l on l.id=a.request_line_id join public.material_requests r on r.id=l.request_id where l.id=p_request_line_id and loc.warehouse_id is distinct from r.source_warehouse_id) then
    raise exception 'Choose the warehouse allocation to release this material' using errcode='22023';
  end if;
  if v_actor is null or p_idempotency_key is null or p_request_line_id is null or p_transaction_date is null then
    raise exception 'request line, date and idempotency key are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('line', p_request_line_id, 'quantity', p_quantity,
    'date', p_transaction_date, 'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'dispatch_approved_request_line', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_line from public.material_request_lines where id = p_request_line_id for update;
  if not found then raise exception 'request line not found' using errcode = 'P0002'; end if;
  -- A simultaneous retry may have posted while waiting for the line lock.
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'dispatch_approved_request_line', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_request from public.material_requests where id = v_line.request_id;
  if v_request.status not in ('approved', 'partially_approved') then
    raise exception 'request is not approved' using errcode = '22023';
  end if;
  if p_transaction_date < v_request.requested_at::date then raise exception 'dispatch date precedes request' using errcode = '22023'; end if;
  if not private.can_manage_inventory() and not (
    private.has_any_role(array['warehouse_staff']::public.app_role[])
    and exists (select 1 from public.warehouse_assignments a where a.warehouse_id = v_request.source_warehouse_id
      and a.user_id = v_actor and a.status = 'active')
  ) then raise exception 'not authorized for source warehouse' using errcode = '42501'; end if;
  if not exists (select 1 from public.projects where id = v_request.project_id and status = 'active' and archived_at is null)
    or not exists (select 1 from public.project_sites where id = v_request.project_site_id and status = 'active')
    or not exists (select 1 from public.warehouses where id = v_request.source_warehouse_id and status = 'active')
    or not (exists (select 1 from public.project_warehouses where project_id = v_request.project_id and warehouse_id = v_request.source_warehouse_id)
      or exists(select 1 from private.request_warehouse_assignments a where a.kind='request' and a.target_id=v_request.id and a.warehouse_id=v_request.source_warehouse_id)
      or exists(select 1 from public.material_request_reservations approved join public.inventory_locations loc on loc.id=approved.inventory_location_id where approved.request_line_id=v_line.id and loc.warehouse_id=v_request.source_warehouse_id)) then
    raise exception 'project, site or warehouse is inactive' using errcode = '22023';
  end if;
  perform private.validate_inventory_quantity(p_quantity, v_line.unit_of_measure_id);
  perform private.validate_inventory_material(v_line.material_id, v_line.unit_of_measure_id);
  select coalesce(sum(ti.dispatched_quantity), 0) into v_sent
    from public.material_request_dispatches d join public.inventory_transfer_items ti on ti.id = d.transfer_item_id
    where d.request_line_id = v_line.id;
  if v_sent + p_quantity > v_line.approved_quantity then
    raise exception 'dispatch exceeds remaining approved quantity' using errcode = '22023';
  end if;
  select id into v_source from public.inventory_locations where warehouse_id = v_request.source_warehouse_id;
  select id into v_destination from public.inventory_locations where project_site_id = v_request.project_site_id;
  if v_source is null or v_destination is null then raise exception 'inventory location is missing' using errcode = 'P0002'; end if;
  select * into v_reservation from public.material_request_reservations
    where request_line_id = v_line.id for update;
  if v_reservation.id is null or v_reservation.status <> 'active'
    or v_reservation.remaining_quantity < p_quantity then
    raise exception 'dispatch exceeds remaining reserved quantity' using errcode = '22023';
  end if;
  select quantity_on_hand, reserved_quantity into v_on_hand, v_reserved from public.inventory_balances
    where material_id = v_line.material_id and inventory_location_id = v_source for update;
  if coalesce(v_on_hand, 0) < p_quantity or coalesce(v_reserved, 0) < p_quantity then
    raise exception 'reserved stock is unavailable' using errcode = 'P0001';
  end if;
  -- A retry that waited on the request-line lock must not post another movement.
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'dispatch_approved_request_line', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  insert into public.inventory_transfers (id, source_location_id, destination_location_id,
    external_reference, dispatched_by, dispatched_at, remarks)
  values (v_transfer_id, v_source, v_destination, v_request.request_number,
    v_actor, p_transaction_date::timestamptz, nullif(trim(p_remarks), ''))
  returning transfer_number into v_transfer_number;
  insert into public.inventory_transfer_items (id, transfer_id, material_id, unit_of_measure_id, dispatched_quantity)
    values (v_item_id, v_transfer_id, v_line.material_id, v_line.unit_of_measure_id, p_quantity);
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity,
    reserved_quantity = reserved_quantity - p_quantity, updated_at = now()
    where material_id = v_line.material_id and inventory_location_id = v_source;
  update public.material_request_reservations
    set remaining_quantity = remaining_quantity - p_quantity,
      status = case when remaining_quantity = p_quantity then 'fulfilled' else 'active' end
    where id = v_reservation.id;
  insert into public.material_request_reservation_events (reservation_id, event_type, quantity, actor_id)
    values (v_reservation.id, 'dispatched', p_quantity, v_actor);
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id,
    source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id,
    transfer_phase, reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, v_line.material_id, p_quantity, v_line.unit_of_measure_id,
    v_source, v_destination, 'SITE_TRANSFER', v_transfer_id, v_item_id,
    'dispatch', v_transfer_number, v_request.project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.material_request_dispatches (request_line_id, transfer_item_id) values (v_line.id, v_item_id);
  insert into public.material_request_fulfillment_events (request_line_id, transfer_item_id, event_type, quantity, actor_id)
    values (v_line.id, v_item_id, 'dispatched', p_quantity, v_actor);
  perform private.enqueue_notification_event(
    'material-request-dispatch-' || v_item_id, 'MATERIAL_REQUEST', 'Materials dispatched',
    'Reserved materials were dispatched to the project site.', 'material_request', v_request.id,
    v_request.project_id, null, 'normal', '{}'::public.app_role[], array[v_request.requested_by], null
  );
  insert into public.material_request_fulfillment_receipts (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'dispatch_approved_request_line', v_hash, v_transfer_id);
  return v_transfer_id;
end; $$;
create or replace function public.dispatch_request_allocation_with_manifest(
  p_idempotency_key uuid, p_reservation_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text,
  p_vehicle_asset_id uuid, p_vehicle_label text, p_driver_name text,
  p_delivery_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_transfer_id uuid;
  v_vehicle public.assets%rowtype;
  v_label text;
  v_hash text;
  v_existing public.material_delivery_manifests%rowtype;
begin
  if not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) or not exists(
    select 1 from public.material_request_reservations a join public.inventory_locations loc on loc.id=a.inventory_location_id
    where a.id=p_reservation_id and private.can_access_warehouse(loc.warehouse_id)) then
    raise exception 'not authorized for dispatch warehouse' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_driver_name,''))) not between 2 and 120
    or char_length(trim(coalesce(p_delivery_reference,''))) not between 2 and 120 then
    raise exception 'Driver and delivery reference are required' using errcode = '22023';
  end if;
  if p_vehicle_asset_id is not null then
    select * into v_vehicle from public.assets where id = p_vehicle_asset_id
      and private.can_view_asset(id) and asset_kind = 'vehicle' and archived_at is null and status in ('available','assigned','in_use');
    if v_vehicle.id is null then raise exception 'Delivery vehicle is unavailable' using errcode = '22023'; end if;
    v_label := concat(v_vehicle.code,' · ',v_vehicle.name);
  else
    v_label := trim(coalesce(p_vehicle_label,''));
    if char_length(v_label) not between 2 and 120 then
      raise exception 'Enter the delivery vehicle or transport description' using errcode = '22023';
    end if;
  end if;
  v_hash := md5(jsonb_build_object('vehicle',p_vehicle_asset_id,'label',v_label,
    'driver',trim(p_driver_name),'reference',trim(p_delivery_reference))::text);
  v_transfer_id := private.dispatch_request_allocation_core(
    p_idempotency_key,p_reservation_id,p_quantity,p_transaction_date,p_remarks
  );
  select * into v_existing from public.material_delivery_manifests where transfer_id = v_transfer_id;
  if found then
    if v_existing.payload_hash <> v_hash or v_existing.dispatched_by <> auth.uid() then
      raise exception 'Retry has different delivery details' using errcode = '23505';
    end if;
    return v_transfer_id;
  end if;
  insert into public.material_delivery_manifests (
    transfer_id,vehicle_asset_id,vehicle_label,driver_name,delivery_reference,payload_hash,dispatched_by
  ) values (
    v_transfer_id,p_vehicle_asset_id,v_label,trim(p_driver_name),trim(p_delivery_reference),v_hash,auth.uid()
  );
  return v_transfer_id;
end;
$$;
revoke all on function public.dispatch_request_allocation_with_manifest(uuid,uuid,numeric,date,text,uuid,text,text,text) from public,anon;
grant execute on function public.dispatch_request_allocation_with_manifest(uuid,uuid,numeric,date,text,uuid,text,text,text) to authenticated;
create or replace function public.get_material_request_tracking(p_request_ids uuid[])
returns table(request_id uuid, request_line_id uuid, material_id uuid, project_name text, site_name text,
 site_on_hand numeric, site_available numeric, approved_quantity numeric, reserved numeric,
 dispatched numeric, received numeric, variance numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles
   where id=auth.uid() and is_active and not onboarding_required) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 if p_request_ids is null or cardinality(p_request_ids)>100 then
   raise exception 'Invalid request tracking page' using errcode='22023';
 end if;
 return query
 select r.id,l.id,l.material_id,p.name,s.name,
   case when private.can_access_project_site(r.project_id,r.project_site_id)
     then coalesce(b.quantity_on_hand,0) end,
   case when private.can_access_project_site(r.project_id,r.project_site_id)
     then coalesce(b.available_quantity,0) end,
   l.approved_quantity,coalesce(res.remaining_quantity,0),
   coalesce(del.dispatched,0),coalesce(del.received,0),coalesce(del.variance,0)
 from public.material_requests r
 join public.projects p on p.id=r.project_id
 join public.project_sites s on s.id=r.project_site_id and s.project_id=r.project_id
 join public.material_request_lines l on l.request_id=r.id
 left join public.inventory_locations loc on loc.project_site_id=r.project_site_id
 left join public.inventory_balances b on b.inventory_location_id=loc.id and b.material_id=l.material_id
 left join lateral (select sum(a.remaining_quantity) as remaining_quantity from public.material_request_reservations a where a.request_line_id=l.id) res on true
 left join lateral (
   select sum(i.dispatched_quantity) as dispatched,sum(i.received_quantity) as received,sum(i.variance_quantity) as variance
   from public.material_request_dispatches d join public.inventory_transfer_items i on i.id=d.transfer_item_id
   where d.request_line_id=l.id
 ) del on true
 where r.id=any(p_request_ids) and private.can_view_material_request(r.id)
 order by r.id,l.id;
end; $$;
create or replace function public.list_mobile_warehouse_dispatch(p_warehouse_id uuid, p_offset integer default 0, p_limit integer default 20)
returns table (id uuid, request_number text, project_name text, site_name text, required_date date, ready_lines bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.has_any_role(array['warehouse_staff']::public.app_role[])
    or not private.can_access_warehouse(p_warehouse_id)
    or not exists (select 1 from public.warehouses w where w.id=p_warehouse_id and w.status='active') then
    raise exception 'Warehouse access required' using errcode='42501';
  end if;
  if p_offset is null or p_offset not between 0 and 200000 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid dispatch pagination' using errcode='22023';
  end if;
  return query
  select r.id,r.request_number,p.name,s.name,r.required_date,count(res.id)
  from public.material_requests r
  join public.projects p on p.id=r.project_id
  join public.project_sites s on s.id=r.project_site_id
  join public.material_request_lines l on l.request_id=r.id
  join public.material_request_reservations res on res.request_line_id=l.id
  join public.inventory_locations loc on loc.id=res.inventory_location_id and loc.warehouse_id=p_warehouse_id
  where r.status in ('approved','partially_approved')
    and res.status='active' and res.remaining_quantity > 0
  group by r.id,p.name,s.name
  order by r.required_date,r.id offset p_offset limit p_limit;
end;
$$;
create or replace function public.close_request_remainder(
  p_idempotency_key uuid, p_request_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request public.material_requests%rowtype;
  v_reservation public.material_request_reservations%rowtype;
  v_hash text;
  v_existing uuid;
  v_released integer := 0;
begin
  if v_actor is null or p_idempotency_key is null or p_request_id is null then
    raise exception 'authentication, request and idempotency key are required' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'reason must be 3 to 500 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required) then
    raise exception 'active account required' using errcode = '42501';
  end if;
  v_hash := md5(jsonb_build_object('request', p_request_id, 'reason', trim(p_reason))::text);
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'close_request_remainder', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_request from public.material_requests where id = p_request_id for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not private.can_manage_inventory() and (not private.has_any_role(array['warehouse_staff']::public.app_role[]) or exists(
    select 1 from public.material_request_reservations a join public.material_request_lines l on l.id=a.request_line_id join public.inventory_locations loc on loc.id=a.inventory_location_id
    where l.request_id=p_request_id and a.remaining_quantity>0 and not private.can_access_warehouse(loc.warehouse_id))) then
    raise exception 'not authorized for all source warehouses' using errcode='42501'; end if;
  -- A retry that waited on the request lock must not close twice.
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'close_request_remainder', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  if v_request.status not in ('approved', 'partially_approved') then
    raise exception 'request is not approved' using errcode = '22023';
  end if;
  if not exists (select 1 from public.material_request_dispatches d
    join public.material_request_lines l on l.id = d.request_line_id where l.request_id = p_request_id) then
    raise exception 'nothing dispatched yet; cancel the request instead' using errcode = '22023';
  end if;
  for v_reservation in
    select res.* from public.material_request_lines l
    join public.material_request_reservations res on res.request_line_id = l.id
    where l.request_id = p_request_id and res.status = 'active' and res.remaining_quantity > 0
    order by res.material_id,res.inventory_location_id for update of res
  loop
    update public.inventory_balances
      set reserved_quantity = reserved_quantity - v_reservation.remaining_quantity, updated_at = now()
      where material_id = v_reservation.material_id and inventory_location_id = v_reservation.inventory_location_id
        and reserved_quantity >= v_reservation.remaining_quantity;
    if not found then raise exception 'reservation balance is inconsistent' using errcode = '23514'; end if;
    update public.material_request_reservations
      set remaining_quantity = 0, status = 'released', released_at = now()
      where id = v_reservation.id;
    insert into public.material_request_reservation_events (reservation_id, event_type, quantity, actor_id, reason)
      values (v_reservation.id, 'released', v_reservation.remaining_quantity, v_actor, trim(p_reason));
    v_released := v_released + 1;
  end loop;
  if v_released = 0 then raise exception 'no reserved stock remains to release' using errcode = '22023'; end if;
  insert into public.material_request_fulfillment_receipts (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'close_request_remainder', v_hash, p_request_id);
  return p_request_id;
end; $$;
create or replace function public.cancel_material_request(
  p_idempotency_key uuid, p_request_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request public.material_requests%rowtype;
  v_receipt public.material_request_cancellation_receipts%rowtype;
  v_reservation public.material_request_reservations%rowtype;
  v_hash text;
begin
  if v_actor is null or p_idempotency_key is null or p_request_id is null then
    raise exception 'authentication, request and idempotency key are required' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'cancellation reason must be 3 to 500 characters' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('request', p_request_id, 'reason', trim(p_reason))::text);
  select * into v_request from public.material_requests where id = p_request_id for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required)
     or (v_request.requested_by <> v_actor and not private.can_manage_inventory()) then
    raise exception 'requester or administrator access required' using errcode = '42501';
  end if;
  select * into v_receipt from public.material_request_cancellation_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_id <> v_actor or v_receipt.request_id <> p_request_id or v_receipt.payload_hash <> v_hash then
      raise exception 'idempotency key was used for another cancellation' using errcode = '23505';
    end if;
    return p_request_id;
  end if;
  if v_request.status not in ('submitted','approved','partially_approved') then
    raise exception 'request cannot be cancelled' using errcode = '22023';
  end if;
  for v_reservation in
    select res.* from public.material_request_lines l
    join public.material_request_reservations res on res.request_line_id = l.id
    where l.request_id = p_request_id order by res.material_id,res.inventory_location_id for update of res
  loop
    if exists (select 1 from public.material_request_dispatches d
      where d.request_line_id = v_reservation.request_line_id) then
      raise exception 'dispatched request cannot be cancelled' using errcode = '22023';
    end if;
    if v_reservation.remaining_quantity > 0 then
      update public.inventory_balances
        set reserved_quantity = reserved_quantity - v_reservation.remaining_quantity, updated_at = now()
        where material_id = v_reservation.material_id and inventory_location_id = v_reservation.inventory_location_id
          and reserved_quantity >= v_reservation.remaining_quantity;
      if not found then raise exception 'reservation balance is inconsistent' using errcode = '23514'; end if;
      update public.material_request_reservations
        set remaining_quantity = 0, status = 'released', released_at = now()
        where id = v_reservation.id;
      insert into public.material_request_reservation_events (reservation_id, event_type, quantity, actor_id)
        values (v_reservation.id, 'released', v_reservation.remaining_quantity, v_actor);
    end if;
  end loop;
  if exists (select 1 from public.material_request_dispatches d
    join public.material_request_lines l on l.id = d.request_line_id where l.request_id = p_request_id) then
    raise exception 'dispatched request cannot be cancelled' using errcode = '22023';
  end if;
  update public.material_requests set status = 'cancelled', decided_by = coalesce(decided_by, v_actor),
    decided_at = coalesce(decided_at, now()), decision_reason = trim(p_reason) where id = p_request_id;
  insert into public.material_request_events (request_id, event_type, actor_id, details)
    values (p_request_id, 'cancelled', v_actor, jsonb_build_object('reason', trim(p_reason)));
  perform private.enqueue_notification_event(
    'material-request-cancelled-' || p_request_id, 'MATERIAL_REQUEST', 'Material request cancelled',
    'A project material request was cancelled before dispatch.', 'material_request', p_request_id,
    v_request.project_id, null, 'normal',
    array['admin','engineer']::public.app_role[], '{}'::uuid[], null
  );
  insert into public.material_request_cancellation_receipts (idempotency_key, request_id, actor_id, payload_hash)
    values (p_idempotency_key, p_request_id, v_actor, v_hash);
  return p_request_id;
end; $$;
create or replace function public.get_approved_request_queue(p_limit integer default 20, p_offset integer default 0)
returns table (
  request_line_id uuid, request_id uuid, request_number text,
  project_code text, project_name text, site_name text,
  warehouse_id uuid, warehouse_name text,
  material_code text, material_name text,
  approved_quantity numeric, dispatched_quantity numeric,
  available_quantity numeric, reserved_quantity numeric, unit_symbol text, total_count bigint
) language sql stable security definer set search_path = '' as $$
  select l.id, r.id, r.request_number, p.code, p.name, s.name,
    w.id, w.name, m.code, m.name, res.original_quantity,
    sent.quantity, coalesce(b.available_quantity, 0), coalesce(res.remaining_quantity, 0), u.symbol, count(*) over ()
  from public.material_requests r
  join public.material_request_lines l on l.request_id = r.id and l.approved_quantity > 0
  join public.projects p on p.id = r.project_id
  join public.project_sites s on s.id = r.project_site_id
  join public.material_request_reservations res on res.request_line_id=l.id
  join public.inventory_locations il on il.id=res.inventory_location_id
  join public.warehouses w on w.id=il.warehouse_id
  join public.materials m on m.id = l.material_id
  join public.units_of_measure u on u.id = l.unit_of_measure_id
  left join public.inventory_balances b on b.material_id = l.material_id and b.inventory_location_id = il.id
  cross join lateral (
    select coalesce(sum(ti.dispatched_quantity), 0) as quantity
    from public.material_request_dispatches d
    join public.inventory_transfer_items ti on ti.id = d.transfer_item_id
    where d.request_line_id = l.id and d.reservation_id=res.id
  ) sent
  where r.status in ('approved', 'partially_approved')
    and p.status = 'active' and p.archived_at is null and s.status = 'active' and w.status = 'active'
    and res.remaining_quantity > 0
    and (
      private.can_manage_inventory()
      or (private.has_any_role(array['warehouse_staff']::public.app_role[])
        and exists (select 1 from public.warehouse_assignments a where a.warehouse_id = w.id
          and a.user_id = auth.uid() and a.status = 'active'))
    )
  order by r.requested_at, r.request_number, m.name
  limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.get_request_stock_sources(p_request_id uuid)
returns table(request_line_id uuid,warehouse_id uuid,warehouse_name text,on_hand numeric,available numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_view_material_request(p_request_id) then raise exception 'Request access required' using errcode='42501'; end if;
 return query select l.id,w.id,w.name,coalesce(b.quantity_on_hand,0),coalesce(b.available_quantity,0)
 from public.material_request_lines l join public.material_requests r on r.id=l.request_id
 cross join public.warehouses w join public.inventory_locations loc on loc.warehouse_id=w.id
 left join public.inventory_balances b on b.material_id=l.material_id and b.inventory_location_id=loc.id
 where r.id=p_request_id and r.status='submitted' and w.status='active' and private.can_access_warehouse(w.id)
 order by l.id,w.name,w.id;
end; $$;
revoke all on function public.get_request_stock_sources(uuid) from public,anon;
grant execute on function public.get_request_stock_sources(uuid) to authenticated;

create function public.get_request_allocations(p_request_id uuid)
returns table(id uuid,request_line_id uuid,warehouse_id uuid,warehouse_name text,original_quantity numeric,remaining_quantity numeric,can_dispatch boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_view_material_request(p_request_id) then raise exception 'Request access required' using errcode='42501'; end if;
 return query select a.id,a.request_line_id,w.id,w.name,a.original_quantity,a.remaining_quantity,
   private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) and private.can_access_warehouse(w.id) and w.status='active'
 from public.material_request_reservations a join public.material_request_lines l on l.id=a.request_line_id
 join public.inventory_locations loc on loc.id=a.inventory_location_id join public.warehouses w on w.id=loc.warehouse_id
 where l.request_id=p_request_id order by l.id,w.name,a.id;
end; $$;
revoke all on function public.get_request_allocations(uuid) from public,anon;
grant execute on function public.get_request_allocations(uuid) to authenticated;
create or replace function public.dispatch_approved_request_line_with_manifest(
  p_idempotency_key uuid, p_request_line_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text,
  p_vehicle_asset_id uuid, p_vehicle_label text, p_driver_name text,
  p_delivery_reference text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_transfer_id uuid;
  v_vehicle public.assets%rowtype;
  v_label text;
  v_hash text;
  v_existing public.material_delivery_manifests%rowtype;
begin
  if (select count(*) from public.material_request_reservations where request_line_id=p_request_line_id)>1
    and exists(select 1 from public.material_request_reservations a join public.inventory_locations loc on loc.id=a.inventory_location_id where a.request_line_id=p_request_line_id and private.can_access_warehouse(loc.warehouse_id)) then
    raise exception 'Choose the warehouse allocation to release this material' using errcode='22023'; end if;
  if not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) or not exists(
    select 1 from public.material_request_lines l join public.material_requests r on r.id=l.request_id
    where l.id=p_request_line_id and private.can_access_warehouse(r.source_warehouse_id)) then
    raise exception 'not authorized for dispatch warehouse' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_driver_name,''))) not between 2 and 120
    or char_length(trim(coalesce(p_delivery_reference,''))) not between 2 and 120 then
    raise exception 'Driver and delivery reference are required' using errcode = '22023';
  end if;
  if p_vehicle_asset_id is not null then
    select * into v_vehicle from public.assets where id = p_vehicle_asset_id
      and private.can_view_asset(id) and asset_kind = 'vehicle' and archived_at is null and status in ('available','assigned','in_use');
    if v_vehicle.id is null then raise exception 'Delivery vehicle is unavailable' using errcode = '22023'; end if;
    v_label := concat(v_vehicle.code,' · ',v_vehicle.name);
  else
    v_label := trim(coalesce(p_vehicle_label,''));
    if char_length(v_label) not between 2 and 120 then
      raise exception 'Enter the delivery vehicle or transport description' using errcode = '22023';
    end if;
  end if;
  v_hash := md5(jsonb_build_object('vehicle',p_vehicle_asset_id,'label',v_label,
    'driver',trim(p_driver_name),'reference',trim(p_delivery_reference))::text);
  v_transfer_id := public.dispatch_approved_request_line(
    p_idempotency_key,p_request_line_id,p_quantity,p_transaction_date,p_remarks
  );
  select * into v_existing from public.material_delivery_manifests where transfer_id = v_transfer_id;
  if found then
    if v_existing.payload_hash <> v_hash or v_existing.dispatched_by <> auth.uid() then
      raise exception 'Retry has different delivery details' using errcode = '23505';
    end if;
    return v_transfer_id;
  end if;
  insert into public.material_delivery_manifests (
    transfer_id,vehicle_asset_id,vehicle_label,driver_name,delivery_reference,payload_hash,dispatched_by
  ) values (
    v_transfer_id,p_vehicle_asset_id,v_label,trim(p_driver_name),trim(p_delivery_reference),v_hash,auth.uid()
  );
  return v_transfer_id;
end;
$$;
create or replace function public.decide_material_request(
  p_idempotency_key uuid, p_request_id uuid, p_decisions jsonb, p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request public.material_requests%rowtype;
  v_receipt public.material_request_decision_receipts%rowtype;
  v_hash text;
  v_line public.material_request_lines%rowtype;
  v_decision jsonb;
  v_qty numeric;
  v_location_id uuid;
  v_reservation_id uuid;
  v_available numeric;
  v_approved_count integer := 0;
  v_full_count integer := 0;
  v_status public.material_request_status;
begin
  if v_actor is null or p_idempotency_key is null or p_request_id is null then raise exception 'authentication and request are required' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required) then
    raise exception 'active account required' using errcode = '42501';
  end if;
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'object' then raise exception 'invalid request decision' using errcode = '22023'; end if;
  select * into v_request from public.material_requests where id=p_request_id;
  if not found then raise exception 'request not found' using errcode='P0002'; end if;
  if not private.can_review_project_site(v_request.project_id,v_request.project_site_id) then
    raise exception 'assigned site engineer or admin approval required' using errcode='42501';
  end if;
  if v_request.requested_by=v_actor and not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'requesters cannot approve their own requests' using errcode='42501';
  end if;
  v_hash := md5(jsonb_build_object('request', p_request_id, 'decisions', p_decisions, 'reason', nullif(trim(coalesce(p_reason,'')),''))::text);
  select * into v_receipt from public.material_request_decision_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_id <> v_actor or v_receipt.request_id <> p_request_id or v_receipt.payload_hash <> v_hash then
      raise exception 'idempotency key was used for another decision' using errcode = '23505';
    end if;
    return p_request_id;
  end if;
  select * into v_request from public.material_requests where id = p_request_id for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  -- A concurrent retry may have committed while this call waited for the request lock.
  select * into v_receipt from public.material_request_decision_receipts where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_id <> v_actor or v_receipt.request_id <> p_request_id or v_receipt.payload_hash <> v_hash then
      raise exception 'idempotency key was used for another decision' using errcode = '23505';
    end if;
    return p_request_id;
  end if;
  if v_request.status <> 'submitted' then raise exception 'request is already decided' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_decisions)) <> (select count(*) from public.material_request_lines where request_id = p_request_id) then
    raise exception 'decision must cover every line' using errcode = '22023';
  end if;
  if v_request.source_warehouse_id is null then
    raise exception 'Choose a source warehouse before approval' using errcode='22023';
  end if;
  select id into v_location_id from public.inventory_locations
    where warehouse_id = v_request.source_warehouse_id;
  if v_location_id is null then raise exception 'source warehouse location is missing' using errcode = 'P0002'; end if;
  for v_line in select * from public.material_request_lines where request_id = p_request_id order by material_id for update loop
    v_decision := p_decisions -> v_line.id::text;
    if v_decision is null or jsonb_typeof(v_decision) <> 'string'
       or (v_decision #>> '{}') !~ '^[0-9]{1,10}(\.[0-9]{1,4})?$' then
      raise exception 'invalid approved quantity' using errcode = '22023';
    end if;
    v_qty := (v_decision #>> '{}')::numeric;
    if v_qty > v_line.requested_quantity then raise exception 'approved quantity exceeds request' using errcode = '22023'; end if;
    if v_qty > 0 then
      perform private.validate_inventory_quantity(v_qty,v_line.unit_of_measure_id);
      select available_quantity into v_available from public.inventory_balances
        where material_id = v_line.material_id and inventory_location_id = v_location_id for update;
      if coalesce(v_available, 0) < v_qty then
        raise exception 'insufficient available stock to reserve for material %', v_line.material_id using errcode = 'P0001';
      end if;
      update public.inventory_balances set reserved_quantity = reserved_quantity + v_qty, updated_at = now()
        where material_id = v_line.material_id and inventory_location_id = v_location_id;
      insert into public.material_request_reservations
        (request_line_id, material_id, inventory_location_id, original_quantity, remaining_quantity, reserved_by)
        values (v_line.id, v_line.material_id, v_location_id, v_qty, v_qty, v_actor)
        returning id into v_reservation_id;
      insert into public.material_request_reservation_events (reservation_id, event_type, quantity, actor_id)
        values (v_reservation_id, 'reserved', v_qty, v_actor);
    end if;
    if v_qty > 0 then v_approved_count := v_approved_count + 1; end if;
    if v_qty = v_line.requested_quantity then v_full_count := v_full_count + 1; end if;
    update public.material_request_lines set approved_quantity = v_qty where id = v_line.id;
  end loop;
  if v_approved_count = 0 then v_status := 'rejected';
  elsif v_full_count = (select count(*) from jsonb_object_keys(p_decisions)) then v_status := 'approved';
  else v_status := 'partially_approved'; end if;
  if v_status <> 'approved' and char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'reason is required when reducing or rejecting a request' using errcode = '22023';
  end if;
  update public.material_requests set status = v_status, decided_by = v_actor, decided_at = now(),
    decision_reason = nullif(trim(coalesce(p_reason,'')),'') where id = p_request_id;
  insert into public.material_request_events (request_id, event_type, actor_id, details)
    values (p_request_id, v_status, v_actor, jsonb_build_object('approvedQuantities', p_decisions, 'reason', p_reason));
  perform private.enqueue_notification_event(
    'material-request-decided-' || p_request_id, 'MATERIAL_REQUEST', 'Material request decided',
    'Your material request was ' || replace(v_status::text, '_', ' ') || '.',
    'material_request', p_request_id, v_request.project_id, null, 'normal',
    '{}'::public.app_role[], array[v_request.requested_by], null
  );
  insert into public.material_request_decision_receipts (idempotency_key, request_id, actor_id, payload_hash)
    values (p_idempotency_key, p_request_id, v_actor, v_hash);
  return p_request_id;
end; $$;
notify pgrst,'reload schema';
commit;
