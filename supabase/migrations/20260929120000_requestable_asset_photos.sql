-- Policies on storage.objects need an exclusive lock; fail fast instead of
-- deadlocking with live photo reads. Re-run if it times out.
set local lock_timeout = '5s';

-- Engineers and Foremen pick equipment and vehicles from linked warehouses and
-- follow their own requests after an asset is returned. Let them see those
-- assets' photos without widening access to the asset registry itself.
create function private.can_view_asset_photo(p_asset_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_view_asset(p_asset_id)
    or exists (
      select 1 from public.equipment_requests request
      where request.asset_id = p_asset_id and request.requested_by = auth.uid()
    )
    or (
      private.has_any_role(array['engineer','foreman']::public.app_role[])
      and exists (
        select 1 from public.assets asset
        join public.asset_locations asset_location on asset_location.id = asset.current_location_id
        join public.inventory_locations location on location.id = asset_location.inventory_location_id
        join public.project_warehouses project_warehouse on project_warehouse.warehouse_id = location.warehouse_id
        join public.warehouses warehouse on warehouse.id = project_warehouse.warehouse_id and warehouse.status = 'active'
        where asset.id = p_asset_id and asset.archived_at is null
          and private.can_view_mobile_project(project_warehouse.project_id)
      )
    )
$$;
revoke all on function private.can_view_asset_photo(uuid) from public, anon;
grant execute on function private.can_view_asset_photo(uuid) to authenticated;

-- Batch lookup for list thumbnails; returns only photos the caller may view.
create function public.get_asset_photo_paths(p_asset_ids uuid[])
returns table(asset_id uuid, photo_path text)
language sql stable security definer set search_path = '' as $$
  select asset.id, asset.photo_path from public.assets asset
  where auth.uid() is not null
    and cardinality(p_asset_ids) <= 100
    and asset.id = any(p_asset_ids)
    and asset.photo_path is not null
    and private.can_view_asset_photo(asset.id)
$$;
revoke all on function public.get_asset_photo_paths(uuid[]) from public, anon;
grant execute on function public.get_asset_photo_paths(uuid[]) to authenticated;

create policy erp_asset_photos_requestable_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos'
  and storage.objects.name ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
  and private.can_view_asset_photo(split_part(storage.objects.name, '/', 2)::uuid)
);
