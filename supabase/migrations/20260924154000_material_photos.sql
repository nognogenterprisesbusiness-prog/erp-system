alter table public.materials
  add column photo_path text
  constraint materials_photo_path_matches_id check (photo_path is null or photo_path = 'materials/' || id::text || '/cover.webp');

create policy erp_material_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and name ~ '^materials/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.photo_path = name and material.archived_at is null)
);

create policy erp_material_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
  and name ~ '^materials/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.archived_at is null)
);

create policy erp_material_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
  and name ~ '^materials/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.archived_at is null)
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
  and name ~ '^materials/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.archived_at is null)
);

create function public.attach_material_photo(p_material_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_path text := 'materials/' || p_material_id::text || '/cover.webp';
begin
  if (select auth.uid()) is null or not private.can_manage_inventory() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.materials where id = p_material_id and archived_at is null) then
    raise exception 'material is unavailable' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'erp-record-photos' and name = v_path) then
    raise exception 'material photo upload is missing' using errcode = '22023';
  end if;
  update public.materials set photo_path = v_path, updated_by = (select auth.uid()) where id = p_material_id;
end;
$$;

revoke execute on function public.attach_material_photo(uuid) from public, anon;
grant execute on function public.attach_material_photo(uuid) to authenticated;
