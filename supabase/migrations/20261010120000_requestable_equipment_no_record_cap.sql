-- PostgREST and the web caller page this scoped result; no asset disappears after 300 rows.
begin;
create or replace function public.get_requestable_equipment(p_project_id uuid, p_project_site_id uuid)
returns table (asset_id uuid, asset_code text, asset_name text, asset_kind public.asset_kind)
language sql stable security definer set search_path = '' as $$
  select asset.id,asset.code,asset.name,asset.asset_kind from public.assets asset
  join public.asset_locations asset_location on asset_location.id = asset.current_location_id
  join public.inventory_locations location on location.id = asset_location.inventory_location_id
  join public.projects project on project.id = p_project_id and project.status = 'active' and project.archived_at is null
  join public.project_sites target_site on target_site.id = p_project_site_id and target_site.project_id = project.id and target_site.status = 'active'
  left join public.project_warehouses project_warehouse on project_warehouse.warehouse_id = location.warehouse_id and project_warehouse.project_id = p_project_id
  left join public.warehouses warehouse on warehouse.id = project_warehouse.warehouse_id and warehouse.status = 'active'
  left join public.project_sites source_site on source_site.id = location.project_site_id and source_site.project_id = p_project_id
  where auth.uid() is not null and not private.can_manage_assets()
    and private.has_any_role(array['engineer','foreman']::public.app_role[])
    and private.can_access_project_site(p_project_id,p_project_site_id)
    and asset.archived_at is null and asset.status = 'available'
    and asset_location.archived_at is null
    and (warehouse.id is not null or source_site.id = target_site.id)
    and not exists (select 1 from public.equipment_requests request
      where request.asset_id = asset.id and request.status in ('approved','checked_out'))
  order by asset.code, asset.id;
$$;
revoke all on function public.get_requestable_equipment(uuid,uuid) from public, anon;
grant execute on function public.get_requestable_equipment(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
