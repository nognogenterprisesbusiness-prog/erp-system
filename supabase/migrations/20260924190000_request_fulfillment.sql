create table public.material_request_dispatches (
  id uuid primary key default gen_random_uuid(),
  request_line_id uuid not null references public.material_request_lines(id) on delete restrict,
  transfer_item_id uuid not null unique references public.inventory_transfer_items(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index material_request_dispatches_line_idx on public.material_request_dispatches (request_line_id);

create type public.material_request_fulfillment_event_type as enum ('dispatched', 'received');
create table public.material_request_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  request_line_id uuid not null references public.material_request_lines(id) on delete restrict,
  transfer_item_id uuid not null references public.inventory_transfer_items(id) on delete restrict,
  event_type public.material_request_fulfillment_event_type not null,
  quantity numeric(20,4) not null check (quantity > 0),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index material_request_fulfillment_events_line_idx on public.material_request_fulfillment_events (request_line_id, occurred_at);

create table public.material_request_fulfillment_receipts (
  idempotency_key uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  command_name text not null,
  payload_hash text not null,
  result_id uuid not null,
  created_at timestamptz not null default now()
);

create function private.existing_request_fulfillment_command(
  p_key uuid, p_command text, p_actor uuid, p_hash text
) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_receipt public.material_request_fulfillment_receipts%rowtype;
begin
  select * into v_receipt from public.material_request_fulfillment_receipts where idempotency_key = p_key;
  if v_receipt.idempotency_key is null then return null; end if;
  if v_receipt.actor_id <> p_actor or v_receipt.command_name <> p_command or v_receipt.payload_hash <> p_hash then
    raise exception 'idempotency key was used for another movement' using errcode = '23505';
  end if;
  return v_receipt.result_id;
end; $$;
revoke execute on function private.existing_request_fulfillment_command(uuid,text,uuid,text) from public, anon, authenticated;

-- Keep legacy movement RPCs for unrelated transfers, but do not let them bypass
-- request fulfillment or silently reverse its event history.
alter function public.dispatch_inventory_transfer(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text) set schema private;
alter function private.dispatch_inventory_transfer(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text) rename to dispatch_inventory_transfer_unrestricted;
revoke execute on function private.dispatch_inventory_transfer_unrestricted(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text) from public, anon, authenticated;
create function public.dispatch_inventory_transfer(
  p_idempotency_key uuid, p_material_id uuid, p_source_location_id uuid, p_destination_location_id uuid,
  p_quantity numeric, p_unit_id uuid, p_external_reference text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.inventory_locations where id = p_source_location_id and project_site_id is not null) then
    if not private.can_manage_inventory() then
      raise exception 'site return requires administrator approval' using errcode = '42501';
    end if;
    if char_length(trim(coalesce(p_remarks, ''))) not between 3 and 2000 then
      raise exception 'site return reason is required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.inventory_locations il join public.warehouses w on w.id = il.warehouse_id
      where il.id = p_destination_location_id and w.status = 'active') then
      raise exception 'site return requires an active warehouse destination' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from public.inventory_locations where id = p_destination_location_id and project_site_id is not null) then
    if not private.can_manage_inventory() then
      raise exception 'site dispatch requires an approved request or administrator exception' using errcode = '42501';
    end if;
    if char_length(trim(coalesce(p_remarks, ''))) < 3 then
      raise exception 'administrator exception reason is required' using errcode = '22023';
    end if;
  end if;
  return private.dispatch_inventory_transfer_unrestricted(p_idempotency_key, p_material_id, p_source_location_id,
    p_destination_location_id, p_quantity, p_unit_id, p_external_reference, p_transaction_date, p_remarks);
end; $$;

alter function public.receive_inventory_transfer(uuid,uuid,numeric,date,text) set schema private;
alter function private.receive_inventory_transfer(uuid,uuid,numeric,date,text) rename to receive_inventory_transfer_unrestricted;
revoke execute on function private.receive_inventory_transfer_unrestricted(uuid,uuid,numeric,date,text) from public, anon, authenticated;
create function public.receive_inventory_transfer(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.material_request_dispatches where transfer_item_id = p_transfer_item_id) then
    raise exception 'receive request-bound stock on the material request' using errcode = '22023';
  end if;
  return private.receive_inventory_transfer_unrestricted(p_idempotency_key, p_transfer_item_id, p_quantity, p_transaction_date, p_remarks);
end; $$;

alter function public.reverse_inventory_transaction(uuid,uuid,text) set schema private;
alter function private.reverse_inventory_transaction(uuid,uuid,text) rename to reverse_inventory_transaction_unrestricted;
revoke execute on function private.reverse_inventory_transaction_unrestricted(uuid,uuid,text) from public, anon, authenticated;
create function public.reverse_inventory_transaction(p_idempotency_key uuid, p_transaction_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.inventory_transactions t
    join public.material_request_dispatches d on d.transfer_item_id = t.transfer_item_id
    where t.id = p_transaction_id) then
    raise exception 'request-bound movements require a dedicated correction workflow' using errcode = '0A000';
  end if;
  return private.reverse_inventory_transaction_unrestricted(p_idempotency_key, p_transaction_id, p_reason);
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
    w.id, w.name, m.code, m.name, l.approved_quantity,
    sent.quantity, coalesce(b.available_quantity, 0), coalesce(res.remaining_quantity, 0), u.symbol, count(*) over ()
  from public.material_requests r
  join public.material_request_lines l on l.request_id = r.id and l.approved_quantity > 0
  join public.projects p on p.id = r.project_id
  join public.project_sites s on s.id = r.project_site_id
  join public.warehouses w on w.id = r.source_warehouse_id
  join public.materials m on m.id = l.material_id
  join public.units_of_measure u on u.id = l.unit_of_measure_id
  join public.inventory_locations il on il.warehouse_id = r.source_warehouse_id
  left join public.inventory_balances b on b.material_id = l.material_id and b.inventory_location_id = il.id
  left join public.material_request_reservations res on res.request_line_id = l.id
  cross join lateral (
    select coalesce(sum(ti.dispatched_quantity), 0) as quantity
    from public.material_request_dispatches d
    join public.inventory_transfer_items ti on ti.id = d.transfer_item_id
    where d.request_line_id = l.id
  ) sent
  where r.status in ('approved', 'partially_approved')
    and p.status = 'active' and p.archived_at is null and s.status = 'active' and w.status = 'active'
    and sent.quantity < l.approved_quantity
    and (
      private.can_manage_inventory()
      or (private.has_any_role(array['warehouse_staff']::public.app_role[])
        and exists (select 1 from public.warehouse_assignments a where a.warehouse_id = w.id
          and a.user_id = auth.uid() and a.status = 'active'))
    )
  order by r.requested_at, r.request_number, m.name
  limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

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
    or not exists (select 1 from public.project_warehouses where project_id = v_request.project_id and warehouse_id = v_request.source_warehouse_id) then
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

create or replace function public.receive_request_transfer(
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
  update public.inventory_transfers set status = case when v_total_received = v_total_dispatched then 'received' else 'partially_received' end,
    received_by = case when v_total_received = v_total_dispatched then v_actor else null end,
    received_at = case when v_total_received = v_total_dispatched then p_transaction_date::timestamptz else null end,
    updated_at = now() where id = v_transfer.id;
  insert into public.material_request_fulfillment_events (request_line_id, transfer_item_id, event_type, quantity, actor_id)
    values (v_line.id, v_item.id, 'received', p_quantity, v_actor);
  insert into public.material_request_fulfillment_receipts (idempotency_key, actor_id, command_name, payload_hash, result_id)
    values (p_idempotency_key, v_actor, 'receive_request_transfer', v_hash, v_transaction_id);
  return v_transaction_id;
end; $$;

alter table public.material_request_dispatches enable row level security;
alter table public.material_request_fulfillment_events enable row level security;
alter table public.material_request_fulfillment_receipts enable row level security;
revoke all on public.material_request_dispatches, public.material_request_fulfillment_events,
  public.material_request_fulfillment_receipts from anon, authenticated;
grant select on public.material_request_dispatches, public.material_request_fulfillment_events to authenticated;
create policy request_dispatches_project_select on public.material_request_dispatches for select to authenticated using (
  exists (select 1 from public.material_request_lines l where l.id = request_line_id
    and private.can_view_material_request(l.request_id))
  or exists (select 1 from public.inventory_transfer_items i
    join public.inventory_transfers t on t.id = i.transfer_id
    where i.id = transfer_item_id and
      (private.can_view_inventory_location(t.source_location_id) or private.can_view_inventory_location(t.destination_location_id)))
);
create policy request_fulfillment_events_project_select on public.material_request_fulfillment_events for select to authenticated using (
  exists (select 1 from public.material_request_lines l where l.id = request_line_id
    and private.can_view_material_request(l.request_id))
);
revoke execute on function public.get_approved_request_queue(integer,integer),
  public.dispatch_approved_request_line(uuid,uuid,numeric,date,text),
  public.receive_request_transfer(uuid,uuid,numeric,date,text),
  public.dispatch_inventory_transfer(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text),
  public.receive_inventory_transfer(uuid,uuid,numeric,date,text),
  public.reverse_inventory_transaction(uuid,uuid,text) from public, anon;
grant execute on function public.get_approved_request_queue(integer,integer),
  public.dispatch_approved_request_line(uuid,uuid,numeric,date,text),
  public.receive_request_transfer(uuid,uuid,numeric,date,text),
  public.dispatch_inventory_transfer(uuid,uuid,uuid,uuid,numeric,uuid,text,date,text),
  public.receive_inventory_transfer(uuid,uuid,numeric,date,text),
  public.reverse_inventory_transaction(uuid,uuid,text) to authenticated;
