create type public.material_request_status as enum ('submitted', 'approved', 'partially_approved', 'rejected', 'cancelled');

create sequence public.material_request_number_seq;

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('MR-' || lpad(nextval('public.material_request_number_seq')::text, 8, '0')),
  submission_key uuid not null unique,
  submission_hash text not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null,
  source_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  source_warehouse_name text not null,
  required_date date not null,
  purpose text not null check (char_length(trim(purpose)) between 3 and 500),
  status public.material_request_status not null default 'submitted',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(trim(decision_reason)) between 3 and 500),
  constraint material_request_site_fk foreign key (project_id, project_site_id)
    references public.project_sites(project_id, id) on delete restrict,
  constraint material_request_decision_pair check (
    (status = 'submitted' and decided_by is null and decided_at is null)
    or (status <> 'submitted' and decided_by is not null and decided_at is not null)
  )
);
create index material_requests_project_recent_idx on public.material_requests (project_id, requested_at desc);
create index material_requests_warehouse_queue_idx on public.material_requests (source_warehouse_id, requested_at desc)
  where status in ('approved','partially_approved');
create index material_requests_status_recent_idx on public.material_requests (status, requested_at desc);

create table public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  unit_of_measure_id uuid not null references public.units_of_measure(id) on delete restrict,
  requested_quantity numeric(20,4) not null check (requested_quantity > 0 and requested_quantity <= 1000000000),
  approved_quantity numeric(20,4) not null default 0 check (approved_quantity >= 0 and approved_quantity <= requested_quantity),
  unique (request_id, material_id)
);
create index material_request_lines_material_idx on public.material_request_lines (material_id, request_id);

create table public.material_request_reservations (
  id uuid primary key default gen_random_uuid(),
  request_line_id uuid not null unique references public.material_request_lines(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  original_quantity numeric(20,4) not null check (original_quantity > 0),
  remaining_quantity numeric(20,4) not null check (remaining_quantity >= 0 and remaining_quantity <= original_quantity),
  status text not null default 'active' check (status in ('active','fulfilled','released')),
  reserved_by uuid not null references public.profiles(id) on delete restrict,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  constraint material_request_reservation_state check (
    (status = 'active' and remaining_quantity > 0 and released_at is null)
    or (status = 'fulfilled' and remaining_quantity = 0 and released_at is null)
    or (status = 'released' and remaining_quantity = 0 and released_at is not null)
  )
);
create index material_request_reservations_location_idx on public.material_request_reservations
  (inventory_location_id, material_id) where status = 'active';

create table public.material_request_reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.material_request_reservations(id) on delete restrict,
  event_type text not null check (event_type in ('reserved','dispatched','released')),
  quantity numeric(20,4) not null check (quantity > 0),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index material_request_reservation_events_reservation_idx on public.material_request_reservation_events
  (reservation_id, occurred_at);

create table public.material_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete restrict,
  event_type public.material_request_status not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index material_request_events_request_idx on public.material_request_events (request_id, occurred_at);

create table public.material_request_decision_receipts (
  idempotency_key uuid primary key,
  request_id uuid not null references public.material_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  payload_hash text not null,
  created_at timestamptz not null default now()
);

create table public.material_request_cancellation_receipts (
  idempotency_key uuid primary key,
  request_id uuid not null references public.material_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  payload_hash text not null,
  created_at timestamptz not null default now()
);

create or replace function private.can_view_material_request_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects()
    or (private.has_any_role(array['engineer','foreman']::public.app_role[])
      and exists (select 1 from public.project_assignments a where a.project_id = p_project_id
        and a.user_id = auth.uid() and a.status = 'active'
        and a.assignment_role in ('engineer','foreman')));
$$;

create or replace function private.can_view_material_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.material_requests r where r.id = p_request_id
    and private.can_view_material_request_project(r.project_id));
$$;

create or replace function public.get_requestable_warehouses()
returns table(project_id uuid, warehouse_id uuid, code text, name text)
language sql stable security definer set search_path = '' as $$
  select pw.project_id, w.id, w.code, w.name
  from public.project_warehouses pw
  join public.warehouses w on w.id = pw.warehouse_id and w.status = 'active'
  join public.projects p on p.id = pw.project_id and p.status = 'active' and p.archived_at is null
  where private.has_any_role(array['admin']::public.app_role[])
    or (private.has_any_role(array['engineer','foreman']::public.app_role[])
      and exists (select 1 from public.project_assignments a where a.project_id = pw.project_id
        and a.user_id = auth.uid() and a.status = 'active'
        and a.assignment_role in ('engineer','foreman')));
$$;

create or replace function public.submit_material_request(
  p_idempotency_key uuid, p_project_id uuid, p_project_site_id uuid,
  p_source_warehouse_id uuid, p_required_date date, p_purpose text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid;
  v_existing public.material_requests%rowtype;
  v_hash text;
  v_line jsonb;
  v_material public.materials%rowtype;
  v_quantity numeric;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_actor is null or p_idempotency_key is null then raise exception 'authentication and idempotency key are required' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required) then
    raise exception 'active account required' using errcode = '42501';
  end if;
  if p_project_id is null or p_project_site_id is null or p_source_warehouse_id is null or p_required_date is null
     or char_length(trim(coalesce(p_purpose, ''))) not between 3 and 500
     or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'invalid material request' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('project', p_project_id, 'site', p_project_site_id,
    'warehouse', p_source_warehouse_id, 'date', p_required_date, 'purpose', trim(p_purpose), 'lines', p_lines)::text);
  select * into v_existing from public.material_requests where submission_key = p_idempotency_key;
  if found then
    if v_existing.requested_by <> v_actor or v_existing.submission_hash <> v_hash then
      raise exception 'idempotency key was used for different request data' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if not private.has_any_role(array['admin']::public.app_role[])
     and not (private.has_any_role(array['engineer','foreman']::public.app_role[])
       and exists (select 1 from public.project_assignments a where a.project_id = p_project_id
         and a.user_id = v_actor and a.status = 'active'
         and a.assignment_role in ('engineer','foreman'))) then
    raise exception 'not authorized to request for this project' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id and status = 'active' and archived_at is null)
     or not exists (select 1 from public.project_sites where id = p_project_site_id and project_id = p_project_id and status = 'active')
     or not exists (select 1 from public.warehouses w join public.project_warehouses pw on pw.warehouse_id = w.id
       where pw.project_id = p_project_id and w.id = p_source_warehouse_id and w.status = 'active') then
    raise exception 'project, site, or authorized warehouse is unavailable' using errcode = '22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' or (v_line->>'materialId') is null
       or (v_line->>'materialId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_line->>'quantity') !~ '^[0-9]{1,10}(\.[0-9]{1,4})?$' then
      raise exception 'invalid material request line' using errcode = '22023';
    end if;
    if (v_line->>'materialId')::uuid = any(v_seen) then raise exception 'duplicate material in request' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, (v_line->>'materialId')::uuid);
    v_quantity := (v_line->>'quantity')::numeric;
    if v_quantity <= 0 or v_quantity > 1000000000 then raise exception 'invalid requested quantity' using errcode = '22023'; end if;
    select * into v_material from public.materials where id = (v_line->>'materialId')::uuid
      and material_kind = 'consumable' and is_active and archived_at is null;
    if not found then raise exception 'requested material is unavailable' using errcode = '22023'; end if;
  end loop;
  insert into public.material_requests (submission_key, submission_hash, project_id, project_site_id,
    source_warehouse_id, source_warehouse_name, required_date, purpose, requested_by)
  select p_idempotency_key, v_hash, p_project_id, p_project_site_id, p_source_warehouse_id,
    w.name, p_required_date, trim(p_purpose), v_actor from public.warehouses w where w.id = p_source_warehouse_id
  on conflict (submission_key) do nothing returning id into v_request_id;
  if v_request_id is null then
    select * into v_existing from public.material_requests where submission_key = p_idempotency_key;
    if v_existing.requested_by <> v_actor or v_existing.submission_hash <> v_hash then
      raise exception 'idempotency key was used for different request data' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_material from public.materials where id = (v_line->>'materialId')::uuid;
    insert into public.material_request_lines (request_id, material_id, unit_of_measure_id, requested_quantity)
    values (v_request_id, v_material.id, v_material.base_unit_id, (v_line->>'quantity')::numeric);
  end loop;
  insert into public.material_request_events (request_id, event_type, actor_id)
    values (v_request_id, 'submitted', v_actor);
  perform private.enqueue_notification_event(
    'material-request-submitted-' || v_request_id, 'MATERIAL_REQUEST', 'Material request submitted',
    'A project material request is ready for review.', 'material_request', v_request_id,
    p_project_id, null, 'normal', array['admin','engineer']::public.app_role[],
    '{}'::uuid[], null
  );
  return v_request_id;
end; $$;

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
  if not private.has_any_role(array['admin']::public.app_role[])
     and not (private.has_any_role(array['engineer']::public.app_role[])
       and exists (select 1 from public.project_assignments a where a.project_id = v_request.project_id
         and a.user_id = v_actor and a.status = 'active' and a.assignment_role = 'engineer')) then
    raise exception 'assigned engineer or admin approval required' using errcode = '42501';
  end if;
  if v_request.requested_by = v_actor and not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'requesters cannot approve their own requests' using errcode = '42501';
  end if;
  if v_request.status <> 'submitted' then raise exception 'request is already decided' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_decisions)) <> (select count(*) from public.material_request_lines where request_id = p_request_id) then
    raise exception 'decision must cover every line' using errcode = '22023';
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
    where l.request_id = p_request_id order by res.material_id for update of res
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

-- An unlinked release is an exception: only an administrator may post it.
create or replace function public.post_stock_out(
  p_idempotency_key uuid, p_material_id uuid, p_source_location_id uuid, p_quantity numeric,
  p_unit_id uuid, p_reference_document text, p_transaction_date date, p_project_id uuid default null, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_existing uuid; v_transaction_id uuid := gen_random_uuid(); v_available numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'post_stock_out', v_actor); if v_existing is not null then return v_existing; end if;
  if not private.can_manage_inventory() then raise exception 'administrator approval required for direct issue' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_remarks, ''))) not between 3 and 2000 then
    raise exception 'direct issue requires an audit reason' using errcode = '22023';
  end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not private.can_operate_inventory_location(p_source_location_id) or not exists (select 1 from public.inventory_locations where id = p_source_location_id and warehouse_id is not null) then raise exception 'not authorized for source warehouse' using errcode = '42501'; end if;
  if p_project_id is not null and not private.can_access_project(p_project_id) then raise exception 'not authorized for project' using errcode = '42501'; end if;
  select available_quantity into v_available from public.inventory_balances where material_id = p_material_id and inventory_location_id = p_source_location_id for update;
  if coalesce(v_available, 0) < p_quantity then raise exception 'insufficient available stock' using errcode = 'P0001'; end if;
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now() where material_id = p_material_id and inventory_location_id = p_source_location_id;
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type, reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, p_material_id, p_quantity, p_unit_id, p_source_location_id, 'STOCK_OUT', trim(p_reference_document), p_project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'post_stock_out', v_transaction_id, now());
  return v_transaction_id;
end; $$;

create trigger material_requests_audit after insert or update on public.material_requests
  for each row execute function private.audit_row_change();

alter table public.material_requests enable row level security;
alter table public.material_request_lines enable row level security;
alter table public.material_request_events enable row level security;
alter table public.material_request_decision_receipts enable row level security;
alter table public.material_request_reservations enable row level security;
alter table public.material_request_reservation_events enable row level security;
alter table public.material_request_cancellation_receipts enable row level security;
revoke all on public.material_requests, public.material_request_lines, public.material_request_events,
  public.material_request_decision_receipts, public.material_request_reservations,
  public.material_request_reservation_events,
  public.material_request_cancellation_receipts from anon, authenticated;
grant select on public.material_requests, public.material_request_lines, public.material_request_events,
  public.material_request_reservations, public.material_request_reservation_events to authenticated;
create policy material_requests_select_scoped on public.material_requests for select to authenticated using (
  private.can_view_material_request_project(project_id)
);
create policy material_request_lines_select_scoped on public.material_request_lines for select to authenticated
  using (private.can_view_material_request(request_id));
create policy material_request_events_select_scoped on public.material_request_events for select to authenticated
  using (private.can_view_material_request(request_id));
create policy material_request_reservations_select_scoped on public.material_request_reservations for select to authenticated
  using (exists (select 1 from public.material_request_lines l where l.id = request_line_id
    and private.can_view_material_request(l.request_id)));
create policy material_request_reservation_events_select_scoped on public.material_request_reservation_events for select to authenticated
  using (exists (select 1 from public.material_request_reservations res
    join public.material_request_lines l on l.id = res.request_line_id
    where res.id = reservation_id and private.can_view_material_request(l.request_id)));
revoke execute on function private.can_view_material_request(uuid) from public, anon, authenticated;
grant execute on function private.can_view_material_request(uuid) to authenticated;
revoke execute on function private.can_view_material_request_project(uuid) from public, anon, authenticated;
grant execute on function private.can_view_material_request_project(uuid) to authenticated;
revoke execute on function public.get_requestable_warehouses() from public, anon;
grant execute on function public.get_requestable_warehouses() to authenticated;
revoke execute on function public.submit_material_request(uuid,uuid,uuid,uuid,date,text,jsonb),
  public.decide_material_request(uuid,uuid,jsonb,text), public.cancel_material_request(uuid,uuid,text) from public, anon;
grant execute on function public.submit_material_request(uuid,uuid,uuid,uuid,date,text,jsonb),
  public.decide_material_request(uuid,uuid,jsonb,text), public.cancel_material_request(uuid,uuid,text) to authenticated;
