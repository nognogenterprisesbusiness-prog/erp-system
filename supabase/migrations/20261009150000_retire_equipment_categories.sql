-- Equipment uses its existing free-text type. Historical category links remain.
begin;

drop function public.save_asset_category(uuid,public.asset_kind,text,text);
drop function public.archive_asset_category(uuid);
revoke all on public.asset_categories from public,anon,authenticated;
alter table public.assets drop constraint assets_equipment_required_details;
alter table public.assets add constraint assets_equipment_required_details check (
  asset_kind <> 'equipment' or (brand is not null and model is not null and acquisition_date is not null)
);

-- Keep the command signature compatible; category input no longer changes data.
create or replace function public.save_equipment(
  p_id uuid, p_code text, p_name text, p_description text, p_category_id uuid,
  p_brand text, p_model text, p_acquisition_date date, p_ownership_type public.asset_ownership_type,
  p_status public.asset_status, p_location_id uuid, p_condition_notes text,
  p_equipment_type text, p_serial_number text, p_acquisition_cost numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_old public.assets; v_event public.asset_event_type;
begin
  if v_actor is null or not private.can_manage_assets() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('available','under_maintenance','out_of_service')
    or p_ownership_type is null or p_acquisition_date is null
    or char_length(trim(coalesce(p_brand,''))) not between 1 and 120
    or char_length(trim(coalesce(p_model,''))) not between 1 and 120
    or char_length(coalesce(p_description,'')) > 2000
    or char_length(coalesce(p_condition_notes,'')) > 2000 then
    raise exception 'invalid equipment details or workflow-managed status' using errcode = '22023';
  end if;
  if p_code is null or p_name is null or p_equipment_type is null or p_serial_number is null or p_acquisition_cost is null or trim(p_code) !~ '^[A-Z0-9-]{2,32}$' or char_length(trim(p_name)) not between 2 and 160 or char_length(trim(p_equipment_type)) not between 2 and 120 or trim(p_serial_number) !~ '^[A-Z0-9./-]{2,80}$' or p_acquisition_cost < 0 then raise exception 'invalid equipment values' using errcode = '22023'; end if;
  if not exists(select 1 from public.asset_locations where id=p_location_id and archived_at is null)
    or not private.can_view_asset_location(p_location_id) then
    raise exception 'asset location is unavailable' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.assets (asset_kind, code, name, description, brand, model, acquisition_date, ownership_type, status, current_location_id, condition_notes, created_by, updated_by)
    values ('equipment', trim(p_code), trim(p_name), nullif(trim(p_description), ''), trim(p_brand), trim(p_model), p_acquisition_date, p_ownership_type, p_status, p_location_id, nullif(trim(p_condition_notes), ''), v_actor, v_actor)
    returning id into v_id;
    insert into public.equipment_details (asset_id, equipment_type, serial_number, acquisition_cost)
    values (v_id, trim(p_equipment_type), trim(p_serial_number), p_acquisition_cost);
    perform private.record_asset_event(v_id, 'registered', null, p_status, null, p_location_id, 'Equipment registered', jsonb_build_object('code', trim(p_code)), v_actor);
  else
    select * into v_old from public.assets where id = p_id and asset_kind = 'equipment' and archived_at is null for update;
    if v_old.id is null then raise exception 'equipment not found' using errcode = 'P0002'; end if;
    if v_old.status in ('assigned','in_use') or exists (
      select 1 from public.equipment_requests where asset_id=p_id and status='checked_out'
    ) then
      raise exception 'return the equipment before changing its registry details' using errcode = '55000';
    end if;
    update public.assets set code = trim(p_code), name = trim(p_name), description = nullif(trim(p_description), ''), brand = trim(p_brand), model = trim(p_model), acquisition_date = p_acquisition_date, ownership_type = p_ownership_type, status = p_status, current_location_id = p_location_id, condition_notes = nullif(trim(p_condition_notes), ''), updated_by = v_actor where id = p_id;
    update public.equipment_details set equipment_type = trim(p_equipment_type), serial_number = trim(p_serial_number), acquisition_cost = p_acquisition_cost where asset_id = p_id;
    v_id := p_id;
    v_event := case when v_old.current_location_id <> p_location_id then 'location_changed' when v_old.status <> p_status then 'status_changed' else 'details_updated' end;
    perform private.record_asset_event(v_id, v_event, v_old.status, p_status, v_old.current_location_id, p_location_id, 'Equipment record updated', jsonb_build_object('code', trim(p_code)), v_actor);
  end if;
  return v_id;
end;
$$;

drop function private.validate_asset_reference(uuid,public.asset_kind,uuid);
notify pgrst, 'reload schema';
commit;
