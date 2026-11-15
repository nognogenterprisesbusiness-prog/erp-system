-- Equipment/vehicle request lists filtered on assets.asset_kind through an inner join. Engineers and foremen
-- cannot read assets kept at a warehouse (assets_select_authorized), so their own submitted requests for
-- warehouse equipment disappeared from the list. Snapshot the kind on the request like asset_code/asset_name.
begin;
alter table public.equipment_requests add column asset_kind public.asset_kind;
update public.equipment_requests r set asset_kind = a.asset_kind from public.assets a where a.id = r.asset_id;
alter table public.equipment_requests alter column asset_kind set not null;

create function private.set_equipment_request_asset_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select a.asset_kind into new.asset_kind from public.assets a where a.id = new.asset_id;
  return new;
end; $$;
revoke all on function private.set_equipment_request_asset_kind() from public, anon, authenticated;

create trigger equipment_requests_set_asset_kind before insert or update of asset_id on public.equipment_requests
for each row execute function private.set_equipment_request_asset_kind();

create index equipment_requests_kind_created_idx on public.equipment_requests(asset_kind, created_at desc, id);
notify pgrst, 'reload schema';
commit;
