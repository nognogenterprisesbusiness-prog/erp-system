alter table public.projects
  add column photo_path text
  constraint projects_photo_path_matches_id check (photo_path is null or photo_path = 'projects/' || id::text || '/cover.webp');

alter table public.warehouses
  add column photo_path text
  constraint warehouses_photo_path_matches_id check (photo_path is null or photo_path = 'warehouses/' || id::text || '/cover.webp');

alter table public.equipment_details
  add column sku text
  constraint equipment_details_sku_format check (sku is null or sku ~ '^[A-Z0-9./-]{2,80}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('erp-record-photos', 'erp-record-photos', false, 2000000, array['image/webp'])
on conflict (id) do nothing;

create policy erp_record_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and
  case
    when name ~ '^projects/[0-9a-f-]{36}/cover[.]webp$' then private.can_access_project(split_part(name, '/', 2)::uuid)
    when name ~ '^warehouses/[0-9a-f-]{36}/cover[.]webp$' then private.can_access_warehouse(split_part(name, '/', 2)::uuid)
    else false
  end
);

create policy erp_record_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects() and
  case
    when name ~ '^projects/[0-9a-f-]{36}/cover[.]webp$' then exists (select 1 from public.projects where id = split_part(name, '/', 2)::uuid and archived_at is null)
    when name ~ '^warehouses/[0-9a-f-]{36}/cover[.]webp$' then exists (select 1 from public.warehouses where id = split_part(name, '/', 2)::uuid)
    else false
  end
);

create policy erp_record_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects() and
  case
    when name ~ '^projects/[0-9a-f-]{36}/cover[.]webp$' then exists (select 1 from public.projects where id = split_part(name, '/', 2)::uuid and archived_at is null)
    when name ~ '^warehouses/[0-9a-f-]{36}/cover[.]webp$' then exists (select 1 from public.warehouses where id = split_part(name, '/', 2)::uuid)
    else false
  end
);

create function public.save_equipment_with_sku(
  p_id uuid, p_code text, p_name text, p_description text, p_category_id uuid,
  p_brand text, p_model text, p_acquisition_date date, p_ownership_type public.asset_ownership_type,
  p_status public.asset_status, p_location_id uuid, p_condition_notes text,
  p_equipment_type text, p_serial_number text, p_acquisition_cost numeric, p_sku text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_sku text := nullif(upper(trim(p_sku)), '');
begin
  if (select auth.uid()) is null or not private.can_manage_assets() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_sku is not null and v_sku !~ '^[A-Z0-9./-]{2,80}$' then
    raise exception 'invalid equipment SKU' using errcode = '22023';
  end if;
  v_id := public.save_equipment(
    p_id, p_code, p_name, p_description, p_category_id, p_brand, p_model,
    p_acquisition_date, p_ownership_type, p_status, p_location_id, p_condition_notes,
    p_equipment_type, p_serial_number, p_acquisition_cost
  );
  update public.equipment_details set sku = v_sku where asset_id = v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_equipment_with_sku(uuid, text, text, text, uuid, text, text, date, public.asset_ownership_type, public.asset_status, uuid, text, text, text, numeric, text) from public, anon;
grant execute on function public.save_equipment_with_sku(uuid, text, text, text, uuid, text, text, date, public.asset_ownership_type, public.asset_status, uuid, text, text, text, numeric, text) to authenticated;
