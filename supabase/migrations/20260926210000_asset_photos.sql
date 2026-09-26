-- Asset photos share the existing private, verified-WebP bucket.
alter table public.assets add column if not exists photo_path text;
alter table public.assets add constraint assets_photo_path_matches_id
  check (photo_path is null or photo_path = 'assets/' || id::text || '/cover.webp');

grant execute on function private.can_manage_assets() to authenticated;

create policy erp_asset_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and case
    when storage.objects.name ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then private.can_view_asset(split_part(storage.objects.name, '/', 2)::uuid)
    else false end
);
create policy erp_asset_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_assets() and case
    when storage.objects.name ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.assets a where a.id = split_part(storage.objects.name, '/', 2)::uuid and a.archived_at is null)
    else false end
);
create policy erp_asset_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_assets() and case
    when storage.objects.name ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.assets a where a.id = split_part(storage.objects.name, '/', 2)::uuid and a.archived_at is null)
    else false end
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_assets() and case
    when storage.objects.name ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.assets a where a.id = split_part(storage.objects.name, '/', 2)::uuid and a.archived_at is null)
    else false end
);

create function public.attach_asset_photo(p_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_asset public.assets;
  v_path text := 'assets/' || p_asset_id::text || '/cover.webp';
begin
  if v_actor is null or not private.can_manage_assets() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_asset from public.assets where id = p_asset_id and archived_at is null for update;
  if not found then raise exception 'asset is unavailable' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'erp-record-photos' and name = v_path) then
    raise exception 'asset photo upload is missing' using errcode = '22023';
  end if;
  update public.assets set photo_path = v_path, updated_by = v_actor, updated_at = now() where id = p_asset_id;
  perform private.record_asset_event(p_asset_id, 'details_updated', v_asset.status, v_asset.status,
    v_asset.current_location_id, v_asset.current_location_id, 'Asset photo updated', '{}'::jsonb, v_actor);
end;
$$;
revoke execute on function public.attach_asset_photo(uuid) from public, anon;
grant execute on function public.attach_asset_photo(uuid) to authenticated;
