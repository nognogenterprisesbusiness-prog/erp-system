-- Keep equipment requests aligned with the site-level access shown by the
-- requestable-equipment picker. Site-assigned Engineers and Foremen should not
-- need an additional project-wide assignment to request equipment for that site.
create or replace function public.submit_equipment_request(
  p_asset_id uuid,
  p_project_id uuid,
  p_project_site_id uuid,
  p_needed_on date,
  p_expected_return_on date,
  p_purpose text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_asset public.assets%rowtype;
  v_id uuid;
begin
  if v_actor is null
     or private.can_manage_assets()
     or not private.has_any_role(array['engineer','foreman']::public.app_role[])
     or not private.can_access_project_site(p_project_id, p_project_site_id) then
    raise exception 'Not authorized for this project site' using errcode = '42501';
  end if;

  if p_needed_on is null
     or p_expected_return_on is null
     or p_expected_return_on < p_needed_on
     or p_needed_on < current_date - 1
     or p_needed_on > current_date + 365
     or p_expected_return_on > p_needed_on + 365
     or char_length(trim(coalesce(p_purpose, ''))) not between 3 and 500 then
    raise exception 'Invalid equipment request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.projects project
    join public.project_sites site on site.project_id = project.id
    where project.id = p_project_id
      and site.id = p_project_site_id
      and project.status = 'active'
      and project.archived_at is null
      and site.status = 'active'
  ) then
    raise exception 'Select an active project site' using errcode = '22023';
  end if;

  select * into v_asset
  from public.assets
  where id = p_asset_id
    and asset_kind = 'equipment'
    and archived_at is null
  for update;

  if v_asset.id is null or v_asset.status <> 'available' then
    raise exception 'Equipment is not available' using errcode = '22023';
  end if;

  if not private.equipment_source_for_project(
    v_asset.current_location_id,
    p_project_id,
    p_project_site_id
  ) then
    raise exception 'Equipment must be at the project site or a linked warehouse' using errcode = '22023';
  end if;

  insert into public.equipment_requests (
    asset_id,
    asset_code,
    asset_name,
    project_id,
    project_site_id,
    requested_by,
    needed_on,
    expected_return_on,
    purpose
  ) values (
    p_asset_id,
    v_asset.code,
    v_asset.name,
    p_project_id,
    p_project_site_id,
    v_actor,
    p_needed_on,
    p_expected_return_on,
    trim(p_purpose)
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_equipment_request(uuid, uuid, uuid, date, date, text) from public, anon;
grant execute on function public.submit_equipment_request(uuid, uuid, uuid, date, date, text) to authenticated;
