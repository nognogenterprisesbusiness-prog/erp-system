-- Choose a source per shortage, without changing permanent project memberships.
-- The converted site request inherits an audited request-only assignment.
begin;
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
   where w.status='active' and pr.status='active' and pr.archived_at is null
     and private.can_access_warehouse(w.id) order by w.name,w.id;
end; $$;

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
       where warehouse.id = p_source_warehouse_id and warehouse.status = 'active'
         and (exists (select 1 from public.project_warehouses link
           where link.project_id = p_project_id and link.warehouse_id = warehouse.id)
           or (private.has_any_role(array['admin']::public.app_role[])
             and private.can_access_warehouse(warehouse.id)
             and current_setting('app.shortage_request_key',true) = p_idempotency_key::text
             and exists (select 1 from public.material_sourcing_requests report
               where report.id::text = current_setting('app.shortage_report_id',true)
                 and report.status = 'submitted' and report.project_id = p_project_id
                 and report.project_site_id = p_project_site_id
                 and report.source_warehouse_id = warehouse.id)))
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

create or replace function public.create_sourcing_material_request(
  p_idempotency_key uuid,p_report_id uuid,p_material_id uuid,p_quantity numeric,p_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_report public.material_sourcing_requests;
  v_link public.material_sourcing_request_links;
  v_location_id uuid; v_available numeric; v_allocated numeric; v_pending numeric;
  v_request_id uuid; v_note text:=trim(coalesce(p_note,''));
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only Admin can prepare the site request' using errcode='42501';
  end if;
  if p_idempotency_key is null or p_report_id is null or p_material_id is null
    or p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,4)
    or char_length(v_note) not between 3 and 500 then
    raise exception 'Invalid site request from shortage' using errcode='22023';
  end if;
  select * into v_report from public.material_sourcing_requests where id=p_report_id for update;
  if not found then raise exception 'Out-of-stock report not found' using errcode='P0002'; end if;
  select * into v_link from public.material_sourcing_request_links where idempotency_key=p_idempotency_key;
  if found then
    if v_link.material_sourcing_request_id<>p_report_id or v_link.material_id<>p_material_id
      or v_link.quantity<>p_quantity or v_link.note<>v_note or v_link.created_by<>v_actor then
      raise exception 'Retry has different site request details' using errcode='23505';
    end if;
    return v_link.material_request_id;
  end if;
  if v_report.status<>'submitted' or not exists(select 1 from public.materials
      where id=p_material_id and is_active and archived_at is null and material_kind='consumable') then
    raise exception 'Out-of-stock report or material is unavailable' using errcode='22023';
  end if;
  if exists(select 1 from public.purchase_procurement_context context
      where context.material_sourcing_request_id=p_report_id and context.sourcing_material_id<>p_material_id)
    or exists(select 1 from public.material_sourcing_request_links link
      where link.material_sourcing_request_id=p_report_id and link.material_id<>p_material_id) then
    raise exception 'Choose the material already linked to this report' using errcode='22023';
  end if;
  select coalesce(sum(case
      when request.status in ('rejected','cancelled') then 0
      when request.status='partially_approved' then coalesce(line.approved_quantity,0)
      else link.quantity end),0) into v_allocated
    from public.material_sourcing_request_links link
    join public.material_requests request on request.id=link.material_request_id
    left join public.material_request_lines line on line.request_id=request.id
      and line.material_id=link.material_id
    where link.material_sourcing_request_id=p_report_id;
  if p_quantity>v_report.requested_quantity-v_allocated then
    raise exception 'Site request exceeds remaining reported quantity' using errcode='22023';
  end if;
  select id into v_location_id from public.inventory_locations
    where warehouse_id=v_report.source_warehouse_id;
  select available_quantity into v_available from public.inventory_balances
    where inventory_location_id=v_location_id and material_id=p_material_id for update;
  select coalesce(sum(link.quantity),0) into v_pending
    from public.material_sourcing_request_links link
    join public.material_requests request on request.id=link.material_request_id
    where link.material_sourcing_request_id=p_report_id and request.status='submitted';
  if coalesce(v_available,0)-v_pending<p_quantity then
    raise exception 'Receive this quantity into the source warehouse first' using errcode='P0001';
  end if;
  perform pg_catalog.set_config('app.shortage_report_id',p_report_id::text,true);
  perform pg_catalog.set_config('app.shortage_request_key',p_idempotency_key::text,true);
  v_request_id:=public.submit_material_request(p_idempotency_key,v_report.project_id,
    v_report.project_site_id,v_report.source_warehouse_id,
    greatest(v_report.needed_on,(now() at time zone 'Asia/Manila')::date),
    left('Out-of-stock report '||v_report.id||': '||v_report.reason,500),
    jsonb_build_array(jsonb_build_object('materialId',p_material_id,'quantity',p_quantity)));
  perform public.assign_request_warehouse(p_idempotency_key,v_request_id,'request',v_report.source_warehouse_id);
  perform pg_catalog.set_config('app.shortage_report_id','',true);
  perform pg_catalog.set_config('app.shortage_request_key','',true);
  insert into public.material_sourcing_request_links
    (material_sourcing_request_id,material_request_id,material_id,quantity,idempotency_key,note,created_by)
    values(p_report_id,v_request_id,p_material_id,p_quantity,p_idempotency_key,v_note,v_actor);
  if v_allocated+p_quantity=v_report.requested_quantity then
    update public.material_sourcing_requests set status='resolved',catalog_material_id=p_material_id,
      resolution_note=v_note,resolved_by=v_actor,resolved_at=now() where id=p_report_id;
  end if;
  return v_request_id;
end; $$;
revoke all on function public.get_request_warehouse_choices(uuid,text),
 public.submit_material_request(uuid,uuid,uuid,uuid,date,text,jsonb),
 public.create_sourcing_material_request(uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.get_request_warehouse_choices(uuid,text),
 public.submit_material_request(uuid,uuid,uuid,uuid,date,text,jsonb),
 public.create_sourcing_material_request(uuid,uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
