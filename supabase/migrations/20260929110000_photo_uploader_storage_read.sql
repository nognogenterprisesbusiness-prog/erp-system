-- Policies on storage.objects need an exclusive lock; fail fast instead of
-- deadlocking with live photo reads. Re-run if it times out.
set local lock_timeout = '5s';

-- Storage uploads insert with RETURNING, so the new object must also pass a
-- SELECT policy. Material and supplier photos were only readable once the
-- record's photo_path pointed at them, but photo_path is attached only after a
-- successful upload, so every upload failed with an RLS violation. Let the
-- roles that may upload those photos read their own paths as well.
create policy erp_material_photos_manager_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
  and storage.objects.name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
);

create policy erp_supplier_photos_manager_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers()
  and storage.objects.name ~ '^suppliers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
);
