-- The registry editor may change availability/maintenance, but it must never
-- release or relocate an asset whose custody is already recorded as assigned
-- or in use. A separate audited handover workflow is required for that.
create function private.protect_assigned_asset_custody()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('assigned', 'in_use')
    and (new.status is distinct from old.status
      or new.current_location_id is distinct from old.current_location_id) then
    raise exception 'Return the assigned asset through an audited handover before changing its status or location'
      using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger assets_protect_assigned_custody
before update of status, current_location_id on public.assets
for each row execute function private.protect_assigned_asset_custody();

revoke execute on function private.protect_assigned_asset_custody()
from public, anon, authenticated;
