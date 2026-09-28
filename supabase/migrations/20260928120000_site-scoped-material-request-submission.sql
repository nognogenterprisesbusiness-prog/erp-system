-- Keep material-request submission aligned with site-based project access.
-- Older installations required an additional project_assignments row even
-- when an Engineer or Foreman was explicitly assigned to the selected site.
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
  if p_project_id is null or p_project_site_id is null or p_source_warehouse_id is null or p_required_date is null
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
     or not exists (
       select 1
       from public.warehouses warehouse
       join public.project_warehouses link on link.warehouse_id = warehouse.id
       where link.project_id = p_project_id
         and warehouse.id = p_source_warehouse_id
         and warehouse.status = 'active'
     ) then
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
  select p_idempotency_key, v_hash, p_project_id, p_project_site_id,
         p_source_warehouse_id, warehouse.name, p_required_date, trim(p_purpose), v_actor
  from public.warehouses warehouse
  where warehouse.id = p_source_warehouse_id
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

revoke all on function public.submit_material_request(uuid,uuid,uuid,uuid,date,text,jsonb) from public, anon;
grant execute on function public.submit_material_request(uuid,uuid,uuid,uuid,date,text,jsonb) to authenticated;
