-- Optional supplier portraits/logos use the existing private WebP photo bucket.
alter table public.suppliers
  add column photo_path text
  constraint suppliers_photo_path_matches_id check (photo_path is null or photo_path = 'suppliers/' || id::text || '/cover.webp');

create policy erp_supplier_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and name ~ '^suppliers/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.suppliers supplier
    where supplier.id = split_part(name, '/', 2)::uuid and supplier.photo_path = name)
);

create policy erp_supplier_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers()
  and name ~ '^suppliers/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.suppliers supplier
    where supplier.id = split_part(name, '/', 2)::uuid and supplier.archived_at is null)
);

create policy erp_supplier_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers()
  and name ~ '^suppliers/[0-9a-f-]{36}/cover[.]webp$'
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers()
  and name ~ '^suppliers/[0-9a-f-]{36}/cover[.]webp$'
  and exists (select 1 from public.suppliers supplier
    where supplier.id = split_part(name, '/', 2)::uuid and supplier.archived_at is null)
);

create function public.attach_supplier_photo(p_supplier_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_path text := 'suppliers/' || p_supplier_id::text || '/cover.webp';
begin
  if v_actor is null or not private.can_manage_suppliers() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and archived_at is null) then
    raise exception 'supplier is unavailable' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'erp-record-photos' and name = v_path) then
    raise exception 'supplier photo upload is missing' using errcode = '22023';
  end if;
  update public.suppliers set photo_path = v_path, updated_by = v_actor where id = p_supplier_id;
  perform private.record_supplier_event(p_supplier_id, 'details_updated', 'Supplier photo updated', '{}'::jsonb, v_actor);
end;
$$;

revoke execute on function public.attach_supplier_photo(uuid) from public, anon;
grant execute on function public.attach_supplier_photo(uuid) to authenticated;
