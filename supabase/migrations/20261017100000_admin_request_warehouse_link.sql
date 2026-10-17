begin;
create function public.get_admin_request_warehouse_choices(p_id uuid,p_kind text)
returns table(id uuid,name text,code text,is_linked boolean)
language plpgsql stable security definer set search_path='' as $$
declare v_project uuid; v_status text;
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[])
    or not exists(select 1 from public.profiles where profiles.id=auth.uid() and is_active and not onboarding_required) then
    raise exception 'Only Admin can link project warehouses' using errcode='42501';
  end if;
  if p_kind='request' then
    select project_id,status::text into v_project,v_status from public.material_requests where material_requests.id=p_id;
  elsif p_kind='shortage' then
    select project_id,status into v_project,v_status from public.material_sourcing_requests where material_sourcing_requests.id=p_id;
  else raise exception 'Invalid request type' using errcode='22023'; end if;
  if v_status is distinct from 'submitted' then return; end if;
  return query select w.id,w.name,w.code,
    exists(select 1 from public.project_warehouses pw where pw.project_id=v_project and pw.warehouse_id=w.id)
  from public.warehouses w join public.projects p on p.id=v_project
  where w.status='active' and p.status='active' and p.archived_at is null
  order by w.name,w.id;
end; $$;

create function public.link_and_assign_request_warehouse(p_key uuid,p_id uuid,p_kind text,p_warehouse_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_status text;
begin
  if auth.uid() is null or not private.has_any_role(array['admin']::public.app_role[])
    or not exists(select 1 from public.profiles where profiles.id=auth.uid() and is_active and not onboarding_required) then
    raise exception 'Only Admin can link project warehouses' using errcode='42501';
  end if;
  if p_key is null or p_id is null or p_warehouse_id is null or p_kind is null or p_kind not in ('request','shortage') then
    raise exception 'Request, warehouse and retry key are required' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
  if exists(select 1 from private.request_warehouse_assignments where idempotency_key=p_key) then
    return public.assign_request_warehouse(p_key,p_id,p_kind,p_warehouse_id);
  end if;
  if p_kind='request' then
    select project_id,status::text into v_project,v_status from public.material_requests where id=p_id for update;
  elsif p_kind='shortage' then
    select project_id,status into v_project,v_status from public.material_sourcing_requests where id=p_id for update;
  else raise exception 'Invalid request type' using errcode='22023'; end if;
  if v_status is distinct from 'submitted' then
    raise exception 'Only submitted requests can change warehouse' using errcode='22023';
  end if;
  if not exists(select 1 from public.get_admin_request_warehouse_choices(p_id,p_kind) where id=p_warehouse_id) then
    raise exception 'Select an active warehouse for an active project' using errcode='42501';
  end if;
  insert into public.project_warehouses(project_id,warehouse_id,authorized_by)
    values(v_project,p_warehouse_id,auth.uid()) on conflict(project_id,warehouse_id) do nothing;
  return public.assign_request_warehouse(p_key,p_id,p_kind,p_warehouse_id);
end; $$;
revoke all on function public.get_admin_request_warehouse_choices(uuid,text),public.link_and_assign_request_warehouse(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.get_admin_request_warehouse_choices(uuid,text),public.link_and_assign_request_warehouse(uuid,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
