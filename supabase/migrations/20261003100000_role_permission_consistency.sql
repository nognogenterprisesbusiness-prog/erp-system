-- Shared site capabilities used by database commands, web and mobile.
begin;

create or replace function private.project_site_role(p_project_id uuid,p_site_id uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_sites s join public.profiles p on p.id=auth.uid()
 where s.id=p_site_id and s.project_id=p_project_id and (s.status='active' or private.has_any_role(array['admin']::public.app_role[]))
 and p.is_active and not p.onboarding_required and (
 private.has_any_role(array['admin']::public.app_role[]) or (
 exists(select 1 from public.user_roles r where r.user_id=p.id and r.role::text=p_role)
 and ((p_role='engineer' and s.engineer_id=p.id) or (p_role='foreman' and s.foreman_id=p.id)
 or exists(select 1 from public.project_assignments a where a.project_id=p_project_id
 and a.user_id=p.id and a.status='active' and a.assignment_role::text=p_role)))))
$$;
create or replace function private.can_access_project_site(p_project_id uuid,p_site_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.project_site_role(p_project_id,p_site_id,'engineer') or private.project_site_role(p_project_id,p_site_id,'foreman')
$$;
create or replace function private.can_review_project_site(p_project_id uuid,p_site_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.project_site_role(p_project_id,p_site_id,'engineer')
$$;
create or replace function private.mobile_site_role(p_project_id uuid,p_site_id uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_role in ('foreman','engineer') and private.project_site_role(p_project_id,p_site_id,p_role)
$$;
create function public.get_project_site_capabilities(p_project_id uuid,p_site_id uuid)
returns table(can_read boolean,can_review boolean,can_record boolean)
language sql stable security definer set search_path='' as $$
 select private.can_access_project_site(p_project_id,p_site_id),private.can_review_project_site(p_project_id,p_site_id),
 private.project_site_role(p_project_id,p_site_id,'foreman')
$$;
revoke all on function private.project_site_role(uuid,uuid,text),private.can_review_project_site(uuid,uuid),public.get_project_site_capabilities(uuid,uuid) from public,anon;
grant execute on function private.project_site_role(uuid,uuid,text),private.can_review_project_site(uuid,uuid),public.get_project_site_capabilities(uuid,uuid) to authenticated;
create or replace function public.review_daily_report(p_report_id uuid, p_action text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_report public.daily_reports%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_status public.daily_report_status;
  v_event public.daily_report_event_type;
begin
  if v_actor is null or p_report_id is null or p_action is null or p_action not in ('approve','return') then
    raise exception 'invalid report review action' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 or (p_action = 'return' and char_length(coalesce(v_note, '')) < 3) then
    raise exception 'correction reason must be 3 to 500 characters' using errcode = '22023';
  end if;
  select * into v_report from public.daily_reports where id = p_report_id for update;
  if not found then raise exception 'report not found' using errcode = 'P0002'; end if;
  if v_report.prepared_by = v_actor or not exists (
    select 1 from public.profiles where id = v_actor and is_active and not onboarding_required
  ) or not (
    private.can_review_project_site(v_report.project_id,v_report.project_site_id)
  ) then raise exception 'independent assigned engineer or admin review required' using errcode = '42501'; end if;
  if v_report.status <> 'submitted' then raise exception 'only submitted reports can be reviewed' using errcode = '55000'; end if;
  if p_action = 'approve' then
    v_status := 'approved'; v_event := 'approved';
    update public.daily_reports set status = v_status, approved_by = v_actor, approved_at = now()
      where id = p_report_id returning * into v_report;
  else
    v_status := 'requires_revision'; v_event := 'returned_for_correction';
    update public.daily_reports set status = v_status where id = p_report_id returning * into v_report;
  end if;
  insert into public.daily_report_events (report_id, revision, event_type, actor_id, report_snapshot)
    values (p_report_id, v_report.revision, v_event, v_actor,
      to_jsonb(v_report) || jsonb_build_object('review_note', v_note));
  perform private.enqueue_notification_event(
    'daily-report-review-' || p_report_id || '-' || v_report.revision, 'DAILY_REPORT',
    case when p_action = 'approve' then 'Daily report approved' else 'Daily report needs correction' end,
    case when p_action = 'approve' then 'Your daily report was approved.' else 'Your daily report was returned for correction.' end,
    'daily_report', p_report_id, v_report.project_id, null, 'normal',
    '{}'::public.app_role[], array[v_report.prepared_by], null
  );
  return p_report_id;
end; $$;
create or replace function public.record_project_progress(p_report_id uuid, p_percent numeric, p_summary text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_report public.daily_reports; v_existing public.project_progress_entries; v_id uuid;
begin
  select * into v_report from public.daily_reports where id = p_report_id;
  if v_actor is null or v_report.id is null or not private.can_review_project_site(v_report.project_id,v_report.project_site_id)
  then raise exception 'Not authorized to record progress' using errcode = '42501'; end if;
  if v_report.status <> 'approved' or p_percent is null or p_percent < 0 or p_percent > 100
    or char_length(trim(coalesce(p_summary,''))) not between 3 and 500 then
    raise exception 'Use an approved daily report, percent and summary' using errcode = '22023'; end if;
  select * into v_existing from public.project_progress_entries where daily_report_id = p_report_id;
  if v_existing.id is not null then
    if v_existing.completion_percent = p_percent and v_existing.summary = trim(p_summary) then return v_existing.id; end if;
    raise exception 'Progress already recorded for this daily report' using errcode = '23505';
  end if;
  insert into public.project_progress_entries
    (project_id, project_site_id, daily_report_id, progress_date, completion_percent, summary, recorded_by)
  values (v_report.project_id, v_report.project_site_id, p_report_id, v_report.report_date,
    p_percent, trim(p_summary), v_actor)
  on conflict (daily_report_id) do nothing returning id into v_id;
  if v_id is null then
    select * into v_existing from public.project_progress_entries where daily_report_id = p_report_id;
    if v_existing.completion_percent = p_percent and v_existing.summary = trim(p_summary) then return v_existing.id; end if;
    raise exception 'Progress already recorded for this daily report' using errcode = '23505';
  end if;
  return v_id;
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
  if not private.can_access_project_site(v_request.project_id,v_request.project_site_id) then
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
create or replace function public.receive_request_transfer_with_inspection(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text, p_condition text, p_quality_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_transaction_id uuid; v_hash text; v_existing public.material_delivery_acceptances%rowtype;
begin
  if not exists(select 1 from public.material_request_dispatches link
    join public.material_request_lines line on line.id=link.request_line_id
    join public.material_requests request on request.id=line.request_id
    where link.transfer_item_id=p_transfer_item_id
    and private.can_access_project_site(request.project_id,request.project_site_id)) then
    raise exception 'not authorized for receiving site' using errcode='42501';
  end if;
  if p_condition is null or p_condition not in ('accepted','accepted_with_note')
    or (p_condition = 'accepted' and nullif(trim(coalesce(p_quality_note,'')),'') is not null)
    or (p_condition = 'accepted_with_note' and char_length(trim(coalesce(p_quality_note,''))) not between 3 and 500) then
    raise exception 'Review the material acceptance note' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('condition',p_condition,'note',nullif(trim(coalesce(p_quality_note,'')),''))::text);
  v_transaction_id := public.receive_request_transfer(
    p_idempotency_key,p_transfer_item_id,p_quantity,p_transaction_date,p_remarks
  );
  select * into v_existing from public.material_delivery_acceptances
    where inventory_transaction_id = v_transaction_id for update;
  if v_existing.inventory_transaction_id is null then
    raise exception 'Receipt inspection record was not created' using errcode = 'P0002';
  end if;
  if v_existing.inspection_payload_hash is not null then
    if v_existing.inspection_payload_hash <> v_hash or v_existing.received_by <> auth.uid() then
      raise exception 'Retry has different inspection details' using errcode = '23505';
    end if;
    return v_transaction_id;
  end if;
  update public.material_delivery_acceptances
    set condition = p_condition, quality_note = nullif(trim(coalesce(p_quality_note,'')),''),
      inspection_payload_hash = v_hash
    where inventory_transaction_id = v_transaction_id;
  return v_transaction_id;
end;
$$;
revoke execute on function public.receive_request_transfer(uuid,uuid,numeric,date,text) from public,anon,authenticated;
alter policy project_documents_select_authorized on public.project_documents using(private.can_view_assigned_project(project_id));
alter policy project_documents_storage_select_authorized on storage.objects using(case when
 bucket_id='erp-project-documents'
 and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then private.can_view_assigned_project(split_part(storage.objects.name,'/',1)::uuid) else false end);

create or replace function private.has_any_role(required_roles public.app_role[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id
 where r.user_id=auth.uid() and r.role=any(required_roles) and p.is_active and not p.onboarding_required)
$$;
create or replace function private.can_access_warehouse(target_warehouse_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.can_manage_warehouses() or (private.has_any_role(array['warehouse_staff']::public.app_role[])
 and exists(select 1 from public.warehouse_assignments a where a.warehouse_id=target_warehouse_id and a.user_id=auth.uid() and a.status='active'))
$$;
create or replace function private.can_access_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or exists (
    select 1 from public.project_assignments assignment
    join public.profiles profile on profile.id = assignment.user_id and profile.is_active and not profile.onboarding_required
    where assignment.project_id = target_project_id
      and assignment.user_id = auth.uid() and assignment.status = 'active'
      and exists(select 1 from public.user_roles r where r.user_id=assignment.user_id and r.role::text=assignment.assignment_role::text)
  );
$$;
create or replace function private.can_view_assigned_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_access_project(p_project_id) or exists (
    select 1 from public.project_sites site
    join public.profiles profile on profile.id = auth.uid() and profile.is_active and not profile.onboarding_required
    join public.user_roles role on role.user_id = profile.id
    where site.project_id = p_project_id and site.status = 'active'
      and ((site.foreman_id = auth.uid() and role.role = 'foreman')
        or (site.engineer_id = auth.uid() and role.role = 'engineer'))
  );
$$;
create or replace function private.can_view_mobile_site(p_project_id uuid,p_site_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_project_site(p_project_id,p_site_id)
$$;
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
  if not exists(select 1 from public.purchase_order_lines l join public.purchase_orders o on o.id=l.purchase_order_id
    where l.id=p_line_id and private.can_access_warehouse(o.warehouse_id)) then
    raise exception 'Not assigned to purchase receipt warehouse' using errcode='42501';
  end if;
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
create or replace function public.consume_site_material(
  p_idempotency_key uuid, p_material_id uuid, p_site_location_id uuid,
  p_project_id uuid, p_quantity numeric, p_unit_id uuid,
  p_reference_document text, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_hash text;
  v_id uuid := gen_random_uuid();
  v_available numeric;
begin
  if not exists(select 1 from public.inventory_locations l where l.id=p_site_location_id
    and private.can_access_project_site(p_project_id,l.project_site_id)) then
    raise exception 'not authorized for project site consumption' using errcode='42501';
  end if;
  if v_actor is null or p_idempotency_key is null or p_transaction_date is null
    or char_length(trim(coalesce(p_reference_document, ''))) not between 2 and 120 then
    raise exception 'consumption date and reference are required' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('material', p_material_id, 'site', p_site_location_id,
    'project', p_project_id, 'quantity', p_quantity, 'unit', p_unit_id,
    'reference', trim(p_reference_document), 'date', p_transaction_date,
    'remarks', nullif(trim(coalesce(p_remarks, '')), ''))::text);
  v_existing := private.existing_valuation_command(p_idempotency_key, 'consume_site_material', v_actor, v_hash);
  if v_existing is not null then return v_existing; end if;
  perform private.validate_inventory_quantity(p_quantity, p_unit_id);
  perform private.validate_inventory_material(p_material_id, p_unit_id);
  if not exists (select 1 from public.inventory_locations il
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where il.id = p_site_location_id and ps.project_id = p_project_id
      and ps.status = 'active' and p.status = 'active' and p.archived_at is null) then
    raise exception 'active site does not belong to project' using errcode = '22023';
  end if;
  if not private.can_manage_inventory() and not private.can_access_project_site(
    p_project_id,
    (select il.project_site_id from public.inventory_locations il where il.id = p_site_location_id)
  ) then
    raise exception 'not authorized for project site consumption' using errcode = '42501';
  end if;
  select available_quantity into v_available from public.inventory_balances
    where material_id = p_material_id and inventory_location_id = p_site_location_id for update;
  if coalesce(v_available, 0) < p_quantity then
    raise exception 'insufficient site stock' using errcode = 'P0001';
  end if;
  update public.inventory_balances set quantity_on_hand = quantity_on_hand - p_quantity, updated_at = now()
    where material_id = p_material_id and inventory_location_id = p_site_location_id;
  insert into public.inventory_transactions
    (id, material_id, quantity, unit_of_measure_id, source_location_id, transaction_type,
      reference_document, project_id, responsible_user_id, transaction_date, remarks)
  values (v_id, p_material_id, p_quantity, p_unit_id, p_site_location_id, 'MATERIAL_CONSUMPTION',
    trim(p_reference_document), p_project_id, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  insert into public.valuation_command_receipts
    (idempotency_key, actor_id, command_name, payload_hash, result_id)
  values (p_idempotency_key, v_actor, 'consume_site_material', v_hash, v_id);
  return v_id;
end; $$;

create or replace function public.save_project_material_plan_line(
  p_project_id uuid, p_site_id uuid, p_warehouse_id uuid, p_material_id uuid,
  p_quantity numeric, p_required_on date, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null or not private.can_review_project_site(p_project_id,p_site_id)
  then raise exception 'Not authorized to plan project materials' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000 or p_required_on is null
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Invalid material plan quantity, date or note' using errcode = '22023'; end if;
  if not exists(select 1 from public.projects p join public.project_sites s on s.project_id = p.id
      where p.id = p_project_id and s.id = p_site_id and p.archived_at is null
        and p.status in ('draft','active','on_hold') and s.status = 'active')
    or not exists(select 1 from public.project_warehouses pw join public.warehouses w on w.id = pw.warehouse_id
      where pw.project_id = p_project_id and pw.warehouse_id = p_warehouse_id and w.status = 'active')
    or not exists(select 1 from public.materials m where m.id = p_material_id and m.is_active
      and m.archived_at is null and m.material_kind = 'consumable') then
    raise exception 'Project, site, warehouse or material is unavailable' using errcode = '22023'; end if;
  insert into public.project_material_plan_lines
    (project_id, project_site_id, warehouse_id, material_id, planned_quantity, required_on, note, updated_by)
  values (p_project_id, p_site_id, p_warehouse_id, p_material_id, p_quantity, p_required_on, trim(coalesce(p_note,'')), v_actor)
  on conflict (project_id, project_site_id, warehouse_id, material_id) do update
    set planned_quantity = excluded.planned_quantity, required_on = excluded.required_on,
      note = excluded.note, updated_by = v_actor, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;
create function public.get_project_review_sites(p_project_id uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(s.id order by s.id),array[]::uuid[]) from public.project_sites s where s.project_id=p_project_id and private.can_review_project_site(p_project_id,s.id)
$$;
revoke all on function public.get_project_review_sites(uuid) from public,anon;
grant execute on function public.get_project_review_sites(uuid) to authenticated;
alter policy project_documents_storage_insert_manager
  on storage.objects
  with check (case when
    bucket_id = 'erp-project-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.can_manage_projects()
    and exists (
      select 1 from public.projects project
      where project.id = split_part(storage.objects.name, '/', 1)::uuid
        and project.archived_at is null
    )
    else false end);
alter policy project_documents_storage_delete_manager
  on storage.objects
  using (
    bucket_id = 'erp-project-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.can_manage_projects()
  );

create or replace function private.receive_inventory_transfer_unrestricted(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric, p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_existing uuid; v_transaction_id uuid := gen_random_uuid(); v_item public.inventory_transfer_items; v_transfer public.inventory_transfers; v_total_dispatched numeric; v_total_received numeric;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'receive_inventory_transfer', v_actor); if v_existing is not null then return v_existing; end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null then raise exception 'transfer item not found' using errcode = 'P0002'; end if;
  perform private.validate_inventory_quantity(p_quantity, v_item.unit_of_measure_id);
  select * into v_transfer from public.inventory_transfers where id = v_item.transfer_id for update;
  if v_transfer.status in ('received','cancelled') then raise exception 'transfer is not receivable' using errcode = '22023'; end if;
  if not private.can_manage_inventory() and not private.can_operate_inventory_location(v_transfer.destination_location_id) then raise exception 'not authorized for destination location' using errcode = '42501'; end if;
  if v_item.received_quantity + p_quantity > v_item.dispatched_quantity then raise exception 'received quantity exceeds remaining in-transit quantity' using errcode = '22023'; end if;
  update public.inventory_transfer_items set received_quantity = received_quantity + p_quantity, updated_at = now() where id = v_item.id;
  insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values (v_item.material_id, v_transfer.destination_location_id, p_quantity)
  on conflict (material_id, inventory_location_id) do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  insert into public.inventory_transactions (id, material_id, quantity, unit_of_measure_id, source_location_id, destination_location_id, transaction_type, transfer_id, transfer_item_id, transfer_phase, reference_document, responsible_user_id, transaction_date, remarks)
  values (v_transaction_id, v_item.material_id, p_quantity, v_item.unit_of_measure_id, v_transfer.source_location_id, v_transfer.destination_location_id, case
    when exists (select 1 from public.inventory_locations where id = v_transfer.source_location_id and project_site_id is not null) then 'MATERIAL_RETURN'::public.inventory_transaction_type
    when exists (select 1 from public.inventory_locations where id = v_transfer.destination_location_id and project_site_id is not null) then 'SITE_TRANSFER'::public.inventory_transaction_type
    else 'WAREHOUSE_TRANSFER'::public.inventory_transaction_type end, v_transfer.id, v_item.id, 'receipt', v_transfer.transfer_number, v_actor, p_transaction_date, nullif(trim(p_remarks), ''));
  select sum(dispatched_quantity), sum(received_quantity) into v_total_dispatched, v_total_received from public.inventory_transfer_items where transfer_id = v_transfer.id;
  update public.inventory_transfers set status = case when v_total_received = v_total_dispatched then 'received'::public.transfer_status else 'partially_received'::public.transfer_status end, received_by = case when v_total_received = v_total_dispatched then v_actor else null end, received_at = case when v_total_received = v_total_dispatched then p_transaction_date::timestamptz else null end, updated_at = now() where id = v_transfer.id;
  insert into public.inventory_command_receipts values (p_idempotency_key, v_actor, 'receive_inventory_transfer', v_transaction_id, now());
  return v_transaction_id;
end; $$;
create or replace function public.receive_inventory_transfer(
  p_idempotency_key uuid, p_transfer_item_id uuid, p_quantity numeric,
  p_transaction_date date, p_remarks text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_item public.inventory_transfer_items%rowtype;
  v_existing uuid;
  v_result uuid;
  v_dispatched numeric;
  v_reconciled numeric;
begin
  if p_idempotency_key is null or p_transaction_date is null then raise exception 'receipt key and date required' using errcode='22023'; end if;
  if not exists(select 1 from public.inventory_transfer_items i join public.inventory_transfers t on t.id=i.transfer_id
    where i.id=p_transfer_item_id and private.can_operate_inventory_location(t.destination_location_id)) then
    raise exception 'not authorized for receiving location' using errcode='42501'; end if;
  if v_actor is null then raise exception 'authentication required' using errcode = '28000'; end if;
  v_existing := private.existing_inventory_command(p_idempotency_key, 'receive_inventory_transfer', v_actor);
  if v_existing is not null then
    if not exists(select 1 from public.inventory_transactions t where t.id=v_existing
      and t.transfer_item_id=p_transfer_item_id and t.quantity=p_quantity and t.transaction_date=p_transaction_date
      and t.remarks is not distinct from nullif(trim(coalesce(p_remarks,'')),'')) then
      raise exception 'idempotency key was used for another receipt' using errcode='23505'; end if;
    return v_existing;
  end if;
  select * into v_item from public.inventory_transfer_items where id = p_transfer_item_id for update;
  if v_item.id is null or v_item.received_quantity + v_item.variance_quantity + p_quantity > v_item.dispatched_quantity then
    raise exception 'receipt exceeds remaining in-transit stock' using errcode = '22023';
  end if;
  v_result := private.receive_inventory_transfer_valued(p_idempotency_key, p_transfer_item_id,
    p_quantity, p_transaction_date, p_remarks);
  perform private.finalize_transfer_receipt_cost(p_transfer_item_id, v_result);
  select sum(dispatched_quantity), sum(received_quantity + variance_quantity) into v_dispatched, v_reconciled
    from public.inventory_transfer_items where transfer_id = v_item.transfer_id;
  if v_dispatched = v_reconciled then
    update public.inventory_transfers set status = 'received', received_by = v_actor,
      received_at = p_transaction_date::timestamptz, updated_at = now() where id = v_item.transfer_id;
  end if;
  return v_result;
end; $$;
commit;
