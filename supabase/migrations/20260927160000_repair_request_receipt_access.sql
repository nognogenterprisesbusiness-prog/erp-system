-- Forward-only repair of the three authenticated staging QA failures.
-- Project/finance access and all stock mutation wrappers remain unchanged.
begin;

create or replace function private.can_view_material_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.material_requests r where r.id = p_request_id and (
      private.can_view_material_request_project(r.project_id)
      or (r.status in ('approved', 'partially_approved')
        and private.has_any_role(array['warehouse_staff']::public.app_role[])
        and private.can_access_warehouse(r.source_warehouse_id))
    )
  );
$$;
revoke all on function private.can_view_material_request(uuid) from public, anon;
grant execute on function private.can_view_material_request(uuid) to authenticated;

drop policy if exists material_requests_select_scoped on public.material_requests;
create policy material_requests_select_scoped on public.material_requests
for select to authenticated using (private.can_view_material_request(id));
-- Existing line, reservation, event and fulfillment policies share the helper.

-- Warehouse staff need only a destination label, not SELECT on whole projects.
create or replace function public.get_material_request_context(p_request_ids uuid[])
returns table(request_id uuid, project_id uuid, project_code text, project_name text, site_id uuid, site_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_ids is null or cardinality(p_request_ids) not between 1 and 20
    or array_position(p_request_ids, null) is not null then
    raise exception 'Supply between 1 and 20 request identifiers' using errcode = '22023';
  end if;
  return query
    select r.id, p.id, p.code, p.name, s.id, s.name
    from public.material_requests r
    join public.projects p on p.id = r.project_id
    join public.project_sites s on s.id = r.project_site_id and s.project_id = r.project_id
    where r.id = any(p_request_ids) and private.can_view_material_request(r.id)
    order by r.id;
end;
$$;
revoke all on function public.get_material_request_context(uuid[]) from public, anon;
grant execute on function public.get_material_request_context(uuid[]) to authenticated;

-- RLS calls this boolean capability helper as authenticated. Granting execution
-- does not grant writes or change its Admin-only decision.
revoke all on function private.can_manage_inventory() from public, anon;
grant execute on function private.can_manage_inventory() to authenticated;

-- Replace the retained implementations, not the public valuation/variance
-- wrappers. Locks, idempotency, authorization, ledger and cost triggers remain.
create or replace function private.receive_request_transfer_unrestricted(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_link public.material_request_dispatches%rowtype;
  v_line public.material_request_lines%rowtype;
  v_request public.material_requests%rowtype;
  v_item public.inventory_transfer_items%rowtype;
  v_transfer public.inventory_transfers%rowtype;
  v_transaction_id uuid := gen_random_uuid();
  v_total_dispatched numeric;
  v_total_received numeric;
  v_hash text;
begin
  if v_actor is null or p_idempotency_key is null or p_transfer_item_id is null or p_transaction_date is null then
    raise exception 'transfer item, date and idempotency key are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('item', p_transfer_item_id, 'quantity', p_quantity,
    'date', p_transaction_date, 'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'receive_request_transfer', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  select * into v_link from public.material_request_dispatches where transfer_item_id = p_transfer_item_id;
  if not found then raise exception 'request-bound transfer not found' using errcode = 'P0002'; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  select * into v_transfer from public.inventory_transfers where id = v_item.transfer_id for update;
  select * into v_line from public.material_request_lines where id = v_link.request_line_id;
  select * into v_request from public.material_requests where id = v_line.request_id;
  if not private.can_view_material_request_project(v_request.project_id) then
    raise exception 'not authorized for receiving project' using errcode = '42501';
  end if;
  if v_transfer.status in ('received', 'cancelled') then raise exception 'transfer is not receivable' using errcode = '22023'; end if;
  if p_transaction_date < v_transfer.dispatched_at::date then raise exception 'receipt date precedes dispatch' using errcode = '22023'; end if;
  perform private.validate_inventory_quantity(p_quantity, v_item.unit_of_measure_id);
  if v_item.received_quantity + p_quantity > v_item.dispatched_quantity then
    raise exception 'received quantity exceeds remaining in-transit quantity' using errcode = '22023';
  end if;
  v_existing := private.existing_request_fulfillment_command(p_idempotency_key, 'receive_request_transfer', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  update public.inventory_transfer_items set received_quantity = received_quantity + p_quantity, updated_at = now() where id = v_item.id;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand)
    values (v_item.material_id, v_transfer.destination_location_id, p_quantity)
    on conflict (material_id, inventory_location_id) do update
      set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id,
    source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id,
    transfer_phase, reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, v_item.material_id, p_quantity, v_item.unit_of_measure_id,
    v_transfer.source_location_id, v_transfer.destination_location_id, 'SITE_TRANSFER', v_transfer.id, v_item.id,
    'receipt', v_transfer.transfer_number, v_request.project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  select sum(dispatched_quantity), sum(received_quantity) into v_total_dispatched, v_total_received
    from public.inventory_transfer_items where transfer_id = v_transfer.id;
  update public.inventory_transfers set status = case when v_total_received = v_total_dispatched
      then 'received'::public.transfer_status else 'partially_received'::public.transfer_status end,
    received_by = case when v_total_received = v_total_dispatched then v_actor else null end,
    received_at = case when v_total_received = v_total_dispatched then p_transaction_date::timestamptz else null end,
    updated_at = now() where id = v_transfer.id;
  insert into public.material_request_fulfillment_events (request_line_id, transfer_item_id, event_type, quantity, actor_id)
    values (v_line.id, v_item.id, 'received', p_quantity, v_actor);
  insert into public.material_request_fulfillment_receipts (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'receive_request_transfer', v_hash, v_transaction_id);
  return v_transaction_id;
end;
$$;

create or replace function private.receive_inventory_transfer_unrestricted(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_existing uuid; v_transaction_id uuid := gen_random_uuid();
  v_item public.inventory_transfer_items; v_transfer public.inventory_transfers;
  v_total_dispatched numeric; v_total_received numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'receive_inventory_transfer', v_actor);
  if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null then raise exception 'transfer item not found' using errcode = 'P0002'; end if;
  perform private.validate_inventory_quantity(p_quantity, v_item.unit_of_measure_id);
  select * into v_transfer from public.inventory_transfers where id = v_item.transfer_id for update;
  if v_transfer.status in ('received', 'cancelled') then raise exception 'transfer is not receivable' using errcode = '22023'; end if;
  if not private.can_manage_inventory() and not private.can_operate_inventory_location(v_transfer.destination_location_id) then
    raise exception 'not authorized for destination location' using errcode = '42501';
  end if;
  if v_item.received_quantity + p_quantity > v_item.dispatched_quantity then
    raise exception 'received quantity exceeds remaining in-transit quantity' using errcode = '22023';
  end if;
  update public.inventory_transfer_items set received_quantity = received_quantity + p_quantity, updated_at = now() where id = v_item.id;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand)
    values (v_item.material_id, v_transfer.destination_location_id, p_quantity)
    on conflict (material_id, inventory_location_id) do update
      set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id,
    source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id,
    transfer_phase, reference_document, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, v_item.material_id, p_quantity, v_item.unit_of_measure_id,
    v_transfer.source_location_id, v_transfer.destination_location_id, case
      when exists (select 1 from public.inventory_locations where id = v_transfer.source_location_id and project_site_id is not null)
        then 'MATERIAL_RETURN'::public.inventory_transaction_type
      when exists (select 1 from public.inventory_locations where id = v_transfer.destination_location_id and project_site_id is not null)
        then 'SITE_TRANSFER'::public.inventory_transaction_type
      else 'WAREHOUSE_TRANSFER'::public.inventory_transaction_type end,
    v_transfer.id, v_item.id, 'receipt', v_transfer.transfer_number, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  select sum(dispatched_quantity), sum(received_quantity) into v_total_dispatched, v_total_received
    from public.inventory_transfer_items where transfer_id = v_transfer.id;
  update public.inventory_transfers set status = case when v_total_received = v_total_dispatched
      then 'received'::public.transfer_status else 'partially_received'::public.transfer_status end,
    received_by = case when v_total_received = v_total_dispatched then v_actor else null end,
    received_at = case when v_total_received = v_total_dispatched then p_transaction_date::timestamptz else null end,
    updated_at = now() where id = v_transfer.id;
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'receive_inventory_transfer', v_transaction_id, now());
  return v_transaction_id;
end;
$$;
revoke all on function private.receive_request_transfer_unrestricted(uuid,uuid,numeric,date,text),
  private.receive_inventory_transfer_unrestricted(uuid,uuid,numeric,date,text) from public, anon, authenticated;
commit;
