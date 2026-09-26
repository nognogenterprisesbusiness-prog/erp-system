-- A Foreman may enter hours for a project they are actively assigned to.
-- Rate selection and costing stay inside this atomic database command; only Admin may set rates or reverse costs.
create or replace function public.post_project_equipment_usage(
  p_idempotency_key uuid, p_project_id uuid, p_asset_id uuid,
  p_use_date date, p_hours numeric, p_work_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_payload jsonb;
  v_existing public.project_equipment_usage;
  v_asset public.assets;
  v_rate public.equipment_hour_rates;
  v_total_hours numeric;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or p_project_id is null or not private.can_record_project_attendance(p_project_id) then
    raise exception 'Only an administrator or assigned foreman can record equipment hours' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_asset_id is null or p_use_date is null
    or p_hours is null or p_hours <= 0 or p_hours > 24 or p_hours <> round(p_hours, 2)
    or char_length(trim(coalesce(p_work_note, ''))) not between 3 and 500 then
    raise exception 'Invalid equipment usage' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('project', p_project_id, 'asset', p_asset_id,
    'date', p_use_date, 'hours', p_hours, 'note', trim(p_work_note));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.project_equipment_usage where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.recorded_by <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Idempotency key already used for another usage' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  select * into v_asset from public.assets where id = p_asset_id for update;
  if v_asset.id is null or v_asset.asset_kind <> 'equipment' or v_asset.archived_at is not null
    or v_asset.status not in ('available','assigned','in_use') then
    raise exception 'Equipment is unavailable' using errcode = '22023';
  end if;
  if not exists(select 1 from public.asset_locations al
    join public.inventory_locations il on il.id = al.inventory_location_id
    join public.project_sites ps on ps.id = il.project_site_id
    join public.projects p on p.id = ps.project_id
    where al.id = v_asset.current_location_id and ps.project_id = p_project_id
      and p.archived_at is null and p.status in ('active','on_hold')
      and ps.status = 'active') then
    raise exception 'Equipment must be located at an active site in this project' using errcode = '22023';
  end if;
  if exists(select 1 from public.project_equipment_usage u
    left join public.project_equipment_usage_reversals r on r.usage_id = u.id
    where u.asset_id = p_asset_id and u.project_id = p_project_id and u.use_date = p_use_date and r.id is null) then
    raise exception 'Equipment usage already posted for this project and date' using errcode = '23505';
  end if;
  select coalesce(sum(u.hours_used), 0) into v_total_hours from public.project_equipment_usage u
  left join public.project_equipment_usage_reversals r on r.usage_id = u.id
  where u.asset_id = p_asset_id and u.use_date = p_use_date and r.id is null;
  if v_total_hours + p_hours > 24 then
    raise exception 'Equipment usage exceeds 24 hours for this date' using errcode = '22023';
  end if;
  select * into v_rate from public.equipment_hour_rates where asset_id = p_asset_id
    and effective_start_date <= p_use_date and (effective_end_date is null or effective_end_date >= p_use_date)
    order by effective_start_date desc limit 1;
  if v_rate.id is null then
    raise exception 'No approved equipment rate for this date' using errcode = '22023';
  end if;
  insert into public.project_equipment_usage (id, project_id, asset_id, asset_code, asset_name,
    use_date, hours_used, rate_id, hourly_rate_snapshot, cost_total, work_note,
    recorded_by, idempotency_key, command_payload)
  values (v_id, p_project_id, p_asset_id, v_asset.code, v_asset.name,
    p_use_date, p_hours, v_rate.id, v_rate.hourly_rate, round(p_hours * v_rate.hourly_rate, 2),
    trim(p_work_note), v_actor, p_idempotency_key, v_payload);
  return v_id;
end;
$$;
