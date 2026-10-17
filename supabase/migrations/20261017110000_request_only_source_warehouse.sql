begin;
-- A saved source authorizes this request only; project warehouse membership is unchanged.
create or replace function public.get_request_warehouse_choices(p_id uuid,p_kind text)
returns table(id uuid,name text,code text) language plpgsql stable security definer set search_path='' as $$
declare v_project uuid; v_status text; v_source uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.is_active and not profile.onboarding_required)
   or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
   raise exception 'Warehouse assignment is not authorized' using errcode='42501';
 end if;
 if p_kind='request' then
   select project_id,status::text,source_warehouse_id into v_project,v_status,v_source from public.material_requests where material_requests.id=p_id;
 elsif p_kind='shortage' and private.has_any_role(array['admin']::public.app_role[]) then
   select project_id,status,source_warehouse_id into v_project,v_status,v_source from public.material_sourcing_requests where material_sourcing_requests.id=p_id;
 else raise exception 'Warehouse assignment is not authorized' using errcode='42501'; end if;
 if v_project is null or v_status<>'submitted' then return; end if;
 if p_kind='request' and not private.can_view_material_request(p_id) then
   raise exception 'Request is unavailable for your account' using errcode='42501';
 end if;
 if v_source is not null and not private.can_access_warehouse(v_source) then return; end if;
 return query select w.id,w.name,w.code from public.warehouses w
   join public.projects pr on pr.id=v_project
   where (p_kind='request' or exists(select 1 from public.project_warehouses pw where pw.project_id=v_project and pw.warehouse_id=w.id)) and w.status='active' and pr.status='active' and pr.archived_at is null
     and private.can_access_warehouse(w.id) order by w.name,w.id;
end; $$;
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
      or exists(select 1 from private.request_warehouse_assignments a where a.kind='request' and a.target_id=v_request.id and a.warehouse_id=v_request.source_warehouse_id)) then
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


drop function if exists public.link_and_assign_request_warehouse(uuid,uuid,text,uuid);
drop function if exists public.get_admin_request_warehouse_choices(uuid,text);
notify pgrst,'reload schema';
commit;
