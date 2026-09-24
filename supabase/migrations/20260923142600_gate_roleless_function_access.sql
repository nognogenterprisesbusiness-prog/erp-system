create or replace function private.notification_scope_allowed(p_type_code text, p_project_id uuid, p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_any_role(enum_range(null::public.app_role))
    and (p_project_id is null or private.can_access_project(p_project_id))
    and (p_warehouse_id is null or private.can_access_warehouse(p_warehouse_id))
    and (p_type_code not in ('FINANCIAL', 'LABOR', 'ATTENDANCE')
      or private.has_any_role(array['super_admin', 'owner', 'admin', 'accounting']::public.app_role[]))
$$;

create or replace function public.resolve_qr_code(p_identifier text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_code public.qr_codes%rowtype; v_name text; v_code_label text; v_project_id uuid;
begin
  if not private.has_any_role(enum_range(null::public.app_role)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_identifier is null or p_identifier !~ '^NQ-[A-F0-9]{32}$' then raise exception 'invalid QR identifier' using errcode = '22023'; end if;
  select * into v_code from public.qr_codes where public_identifier = p_identifier and status = 'active';
  if not found then raise exception 'QR code is invalid or inactive' using errcode = '22023'; end if;
  if v_code.entity_type = 'material' then
    select name, code into v_name, v_code_label from public.materials where id = v_code.material_id and archived_at is null;
  elsif v_code.entity_type in ('equipment', 'vehicle') then
    if not private.can_view_asset(v_code.asset_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name, code into v_name, v_code_label from public.assets where id = v_code.asset_id and archived_at is null;
  elsif v_code.entity_type = 'warehouse' then
    if not private.can_access_warehouse(v_code.warehouse_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name, code into v_name, v_code_label from public.warehouses where id = v_code.warehouse_id and status = 'active';
  else
    select project_id into v_project_id from public.project_sites where id = v_code.project_site_id and status = 'active';
    if v_project_id is null or not private.can_access_project(v_project_id) then raise exception 'not authorized' using errcode = '42501'; end if;
    select name into v_name from public.project_sites where id = v_code.project_site_id;
    select code into v_code_label from public.projects where id = v_project_id;
  end if;
  if v_name is null then raise exception 'QR entity is unavailable' using errcode = '22023'; end if;
  return jsonb_build_object('qr_id', v_code.id, 'identifier', v_code.public_identifier,
    'entity_type', v_code.entity_type, 'entity_id', v_code.entity_id, 'name', v_name,
    'code', v_code_label, 'project_id', v_project_id);
end;
$$;
