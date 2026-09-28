-- Policies on storage.objects need an exclusive lock; fail fast instead of
-- deadlocking with live photo reads. Re-run if it times out.
set local lock_timeout = '5s';

-- Site-assigned Foremen and Engineers (project_sites.foreman_id / engineer_id)
-- can open their project but not its cover photo: the project photo policy
-- still used private.can_access_project, which only checks project-level
-- assignments. Allow them through the same site-aware check the app uses.
create policy erp_project_photos_site_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos'
  and storage.objects.name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
  and private.can_view_assigned_project(split_part(storage.objects.name, '/', 2)::uuid)
);
