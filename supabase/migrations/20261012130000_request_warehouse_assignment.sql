-- Source assignment is separate from authorization and never reserves or moves stock.
begin;
alter table public.material_requests alter column source_warehouse_id drop not null;
alter table public.material_sourcing_requests alter column source_warehouse_id drop not null;
alter table public.material_requests add constraint material_request_approved_source
  check (status not in ('approved','partially_approved') or source_warehouse_id is not null);
create table private.request_warehouse_assignments (
  id uuid not null unique default gen_random_uuid(),
  idempotency_key uuid primary key, target_id uuid not null, kind text not null check(kind in ('request','shortage')),
  warehouse_id uuid not null references public.warehouses(id), actor_id uuid not null references public.profiles(id),
  previous_warehouse_id uuid references public.warehouses(id), created_at timestamptz not null default now()
);
revoke all on private.request_warehouse_assignments from public,anon,authenticated;
create trigger request_warehouse_assignment_audit after insert on private.request_warehouse_assignments
  for each row execute function private.audit_row_change();
create or replace function public.submit_material_request(
  p_idempotency_key uuid,
  p_project_id uuid,
  p_project_site_id uuid,
  p_source_warehouse_id uuid,
  p_required_date date,
  p_purpose text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_actor is null or p_idempotency_key is null then
    raise exception 'authentication and idempotency key are required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_actor and is_active and not onboarding_required) then
    raise exception 'active account required' using errcode = '42501';
  end if;
  if p_project_id is null or p_project_site_id is null or p_required_date is null
     or char_length(trim(coalesce(p_purpose, ''))) not between 3 and 500
     or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'invalid material request' using errcode = '22023';
  end if;

  v_hash := md5(jsonb_build_object(
    'project', p_project_id,
    'site', p_project_site_id,
    'warehouse', p_source_warehouse_id,
    'date', p_required_date,
    'purpose', trim(p_purpose),
    'lines', p_lines
  )::text);
  select * into v_existing from public.material_requests where submission_key = p_idempotency_key;
  if found then
    if v_existing.requested_by <> v_actor or v_existing.submission_hash <> v_hash then
      raise exception 'idempotency key was used for different request data' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  if not private.can_manage_projects()
     and not (
       private.has_any_role(array['engineer','foreman']::public.app_role[])
       and private.can_access_project_site(p_project_id, p_project_site_id)
     ) then
    raise exception 'not authorized to request for this project site' using errcode = '42501';
  end if;
  if not exists (
       select 1 from public.projects
       where id = p_project_id and status = 'active' and archived_at is null
     )
     or not exists (
       select 1 from public.project_sites
       where id = p_project_site_id and project_id = p_project_id and status = 'active'
     )
     or (p_source_warehouse_id is not null and not exists (
       select 1
       from public.warehouses warehouse
       join public.project_warehouses link on link.warehouse_id = warehouse.id
       where link.project_id = p_project_id
         and warehouse.id = p_source_warehouse_id
         and warehouse.status = 'active'
     )) then
    raise exception 'project, site, or authorized warehouse is unavailable' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or (v_line->>'materialId') is null
       or (v_line->>'materialId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_line->>'quantity') !~ '^[0-9]{1,10}(\.[0-9]{1,4})?$' then
      raise exception 'invalid material request line' using errcode = '22023';
    end if;
    if (v_line->>'materialId')::uuid = any(v_seen) then
      raise exception 'duplicate material in request' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, (v_line->>'materialId')::uuid);
    v_quantity := (v_line->>'quantity')::numeric;
    if v_quantity <= 0 or v_quantity > 1000000000 then
      raise exception 'invalid requested quantity' using errcode = '22023';
    end if;
    select * into v_material
    from public.materials
    where id = (v_line->>'materialId')::uuid
      and material_kind = 'consumable' and is_active and archived_at is null;
    if not found then raise exception 'requested material is unavailable' using errcode = '22023'; end if;
  end loop;

  insert into public.material_requests (
    submission_key, submission_hash, project_id, project_site_id,
    source_warehouse_id, source_warehouse_name, required_date, purpose, requested_by
  )
  values (p_idempotency_key, v_hash, p_project_id, p_project_site_id,
         p_source_warehouse_id, coalesce((select name from public.warehouses where id=p_source_warehouse_id),'Awaiting warehouse'), p_required_date, trim(p_purpose), v_actor)
  on conflict (submission_key) do nothing
  returning id into v_request_id;

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
    'material-request-submitted-' || v_request_id,
    'MATERIAL_REQUEST',
    'Material request submitted',
    'A project material request is ready for review.',
    'material_request', v_request_id, p_project_id, null, 'normal',
    array['admin','engineer']::public.app_role[], '{}'::uuid[], null
  );
  return v_request_id;
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
create or replace function public.submit_material_sourcing_request(
  p_key uuid, p_project_id uuid, p_site_id uuid, p_warehouse_id uuid,
  p_material_name text, p_unit_name text, p_quantity numeric,
  p_needed_on date, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_hash text;
  v_existing public.material_sourcing_requests%rowtype;
  v_project public.projects%rowtype;
  v_site public.project_sites%rowtype;
  v_warehouse public.warehouses%rowtype;
  v_id uuid;
begin
  if v_actor is null or p_key is null or p_needed_on is null
    or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
    or p_quantity <> round(p_quantity, 4)
    or char_length(trim(coalesce(p_material_name,''))) not between 2 and 160
    or char_length(trim(coalesce(p_unit_name,''))) not between 1 and 40
    or char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Invalid material sourcing request' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('project',p_project_id,'site',p_site_id,'warehouse',p_warehouse_id,
    'material',trim(p_material_name),'unit',trim(p_unit_name),'quantity',p_quantity,
    'needed_on',p_needed_on,'reason',trim(p_reason))::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  select * into v_existing from public.material_sourcing_requests where idempotency_key = p_key;
  if found then
    if v_existing.requested_by <> v_actor or v_existing.payload_hash <> v_hash then
      raise exception 'Idempotency key already used for another report' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if p_needed_on < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Needed date cannot be in the past' using errcode='22023';
  end if;
  if not private.has_any_role(array['engineer','foreman']::public.app_role[])
    or not private.can_access_project_site(p_project_id,p_site_id) then
    raise exception 'Not authorized for this project site' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = p_project_id and status = 'active' and archived_at is null;
  select * into v_site from public.project_sites where id = p_site_id and project_id = p_project_id and status = 'active';
  select warehouse.* into v_warehouse from public.warehouses warehouse
    join public.project_warehouses link on link.warehouse_id = warehouse.id
    where warehouse.id = p_warehouse_id and warehouse.status = 'active' and link.project_id = p_project_id;
  if v_project.id is null or v_site.id is null or (p_warehouse_id is not null and v_warehouse.id is null) then
    raise exception 'Project, site, or source warehouse is unavailable' using errcode = '22023';
  end if;
  insert into public.material_sourcing_requests (
    idempotency_key,payload_hash,project_id,project_site_id,source_warehouse_id,
    project_name,site_name,warehouse_name,material_name,unit_name,requested_quantity,
    needed_on,reason,requested_by
  ) values (
    p_key,v_hash,p_project_id,p_site_id,p_warehouse_id,
    v_project.name,v_site.name,coalesce(v_warehouse.name,'Awaiting warehouse'),trim(p_material_name),trim(p_unit_name),
    p_quantity,p_needed_on,trim(p_reason),v_actor
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_sourcing_purchase(
  p_idempotency_key uuid,p_supplier_id uuid,p_warehouse_id uuid,
  p_ordered_on date,p_expected_on date,p_purpose text,p_lines jsonb,
  p_supplier_quotation_id uuid,p_report_id uuid,p_material_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_report public.material_sourcing_requests;
  v_context public.purchase_procurement_context;
  v_result jsonb;
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can source an out-of-stock report' using errcode='42501';
  end if;
  if p_report_id is null or p_material_id is null or p_idempotency_key is null then
    raise exception 'Choose the shortage report and catalog material' using errcode='22023';
  end if;
  select * into v_report from public.material_sourcing_requests where id=p_report_id for update;
  if not found then raise exception 'Out-of-stock report not found' using errcode='P0002'; end if;
  select * into v_context from public.purchase_procurement_context where idempotency_key=p_idempotency_key;
  if found then
    if v_context.material_sourcing_request_id is distinct from p_report_id
      or v_context.sourcing_material_id is distinct from p_material_id then
      raise exception 'Retry has different shortage sourcing' using errcode='23505';
    end if;
    return public.submit_procurement_purchase(p_idempotency_key,p_supplier_id,p_warehouse_id,
      p_ordered_on,p_expected_on,p_purpose,p_lines,null,p_supplier_quotation_id);
  end if;
  if v_report.status <> 'submitted' or v_report.source_warehouse_id is distinct from p_warehouse_id then
    raise exception 'Out-of-stock report is unavailable for this warehouse' using errcode='22023';
  end if;
  if not exists(select 1 from public.materials where id=p_material_id
      and is_active and archived_at is null and material_kind='consumable')
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    or not exists(select 1 from jsonb_array_elements(p_lines) line
      where line.value->>'materialId'=p_material_id::text) then
    raise exception 'Purchase must include the chosen shortage material' using errcode='22023';
  end if;
  if exists(select 1 from public.purchase_procurement_context context
    where context.material_sourcing_request_id=p_report_id
      and context.sourcing_material_id<>p_material_id) then
    raise exception 'This report is already sourced as a different material' using errcode='22023';
  end if;
  v_result := public.submit_procurement_purchase(p_idempotency_key,p_supplier_id,p_warehouse_id,
    p_ordered_on,p_expected_on,p_purpose,p_lines,null,p_supplier_quotation_id);
  update public.purchase_procurement_context
    set material_sourcing_request_id=p_report_id,sourcing_material_id=p_material_id
    where idempotency_key=p_idempotency_key;
  return v_result;
end; $$;

create or replace function private.can_view_material_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.material_requests r where r.id=p_request_id and (
   private.can_access_project_site(r.project_id,r.project_site_id)
   or (private.has_any_role(array['warehouse_staff']::public.app_role[]) and (
     (r.status in ('submitted','approved','partially_approved') and private.can_access_warehouse(r.source_warehouse_id))
     or (r.status='submitted' and r.source_warehouse_id is null and exists(
       select 1 from public.project_warehouses pw join public.warehouses w on w.id=pw.warehouse_id
       where pw.project_id=r.project_id and w.status='active' and private.can_access_warehouse(w.id)))))));
$$;
create function public.get_request_warehouse_choices(p_id uuid,p_kind text)
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
 if v_source is not null and not private.can_access_warehouse(v_source) then return; end if;
 return query select w.id,w.name,w.code from public.warehouses w
   join public.project_warehouses pw on pw.warehouse_id=w.id
   join public.projects pr on pr.id=pw.project_id
   where pw.project_id=v_project and w.status='active' and pr.status='active' and pr.archived_at is null
     and private.can_access_warehouse(w.id) order by w.name,w.id;
end; $$;
create function public.assign_request_warehouse(p_key uuid,p_id uuid,p_kind text,p_warehouse_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_existing private.request_warehouse_assignments; v_old uuid; v_name text; v_status text;
begin
 if p_key is null or p_id is null or p_warehouse_id is null or p_kind is null or p_kind not in ('request','shortage') then
   raise exception 'Choose a source warehouse' using errcode='22023'; end if;
 if auth.uid() is null or not exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.is_active and not profile.onboarding_required)
   or not private.has_any_role(array['admin','warehouse_staff']::public.app_role[]) then
   raise exception 'Warehouse assignment is not authorized' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select * into v_existing from private.request_warehouse_assignments where idempotency_key=p_key;
 if found then
   if v_existing.actor_id<>auth.uid() or v_existing.target_id<>p_id or v_existing.kind<>p_kind or v_existing.warehouse_id<>p_warehouse_id then
     raise exception 'Assignment retry has different data' using errcode='23505'; end if;
   return p_id;
 end if;
 if p_kind='request' then
   select source_warehouse_id,status::text into v_old,v_status from public.material_requests where id=p_id for update;
 else
   select source_warehouse_id,status into v_old,v_status from public.material_sourcing_requests where id=p_id for update;
 end if;
 if v_status is distinct from 'submitted' then raise exception 'Only submitted requests can change warehouse' using errcode='22023'; end if;
 select name into v_name from public.get_request_warehouse_choices(p_id,p_kind) where id=p_warehouse_id;
 if v_name is null then raise exception 'Source warehouse is not authorized for this project' using errcode='42501'; end if;
 if p_kind='shortage' and (exists(select 1 from public.purchase_procurement_context where material_sourcing_request_id=p_id)
   or exists(select 1 from public.material_sourcing_request_links where material_sourcing_request_id=p_id)) then
   raise exception 'Sourcing has started; warehouse cannot change' using errcode='22023'; end if;
 if p_kind='request' then
   update public.material_requests set source_warehouse_id=p_warehouse_id,source_warehouse_name=v_name where id=p_id;
 else
   update public.material_sourcing_requests set source_warehouse_id=p_warehouse_id,warehouse_name=v_name where id=p_id;
 end if;
 insert into private.request_warehouse_assignments(idempotency_key,target_id,kind,warehouse_id,actor_id,previous_warehouse_id)
   values(p_key,p_id,p_kind,p_warehouse_id,auth.uid(),v_old);
 return p_id;
end; $$;
create function public.submit_mobile_material_request(p_key uuid,p_project_id uuid,p_site_id uuid,p_purpose text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_date date;
begin
 if p_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select required_date into v_date from public.material_requests where submission_key=p_key;
 return public.submit_material_request(p_key,p_project_id,p_site_id,null,
   coalesce(v_date,(now() at time zone 'Asia/Manila')::date),p_purpose,p_lines);
end; $$;
create function public.submit_mobile_material_shortage(p_key uuid,p_project_id uuid,p_site_id uuid,p_material_id uuid,
 p_name text,p_unit text,p_quantity numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_date date;
begin
 if p_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select needed_on into v_date from public.material_sourcing_requests where idempotency_key=p_key;
 v_date:=coalesce(v_date,(now() at time zone 'Asia/Manila')::date);
 if p_material_id is not null then
   return public.submit_catalog_shortage(p_key,p_project_id,p_site_id,null,p_material_id,p_quantity,v_date,p_reason);
 end if;
 if exists(select 1 from public.material_sourcing_requests where idempotency_key=p_key and reported_material_id is not null) then
   raise exception 'Shortage retry has different catalog identity' using errcode='23505'; end if;
 return public.submit_material_sourcing_request(p_key,p_project_id,p_site_id,null,p_name,p_unit,p_quantity,v_date,p_reason);
end; $$;
revoke all on function public.get_request_warehouse_choices(uuid,text),public.assign_request_warehouse(uuid,uuid,text,uuid),
 public.submit_mobile_material_request(uuid,uuid,uuid,text,jsonb),public.submit_mobile_material_shortage(uuid,uuid,uuid,uuid,text,text,numeric,text) from public,anon;
grant execute on function public.get_request_warehouse_choices(uuid,text),public.assign_request_warehouse(uuid,uuid,text,uuid),
 public.submit_mobile_material_request(uuid,uuid,uuid,text,jsonb),public.submit_mobile_material_shortage(uuid,uuid,uuid,uuid,text,text,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
