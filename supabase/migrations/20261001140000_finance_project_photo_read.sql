-- Finance can read every project (20260930101000_finance_permissions.sql) but
-- the project cover photo policies only allow Admin and assigned staff, so
-- Finance saw a broken image on each project card. Allow Finance to read
-- project cover photos, matching its project read access. No write access.
--
-- Policies on storage.objects need an exclusive lock; fail fast instead of
-- deadlocking with live photo reads. Re-run if it times out.
-- Safe to rerun: the policy is dropped before being created.
set local lock_timeout = '5s';

drop policy if exists erp_project_photos_finance_read on storage.objects;
create policy erp_project_photos_finance_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos'
  and storage.objects.name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
  and private.has_any_role(array['finance']::public.app_role[])
);
