create policy erp_profile_photos_manager_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-profile-photos'
  and private.can_manage_projects()
  and name ~ '^profiles/[0-9a-f-]{36}/avatar[.]webp$'
  and exists (
    select 1 from public.profiles profile
    where profile.id = split_part(name, '/', 2)::uuid and profile.avatar_path = name
  )
);
