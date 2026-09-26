-- Storage may evaluate permissive policies independently and reorder AND terms.
-- Keep every UUID cast behind a CASE branch that first validates the whole path.
drop policy if exists erp_record_photos_select on storage.objects;
create policy erp_record_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then private.can_access_project(split_part(name, '/', 2)::uuid)
    when name ~ '^warehouses/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then private.can_access_warehouse(split_part(name, '/', 2)::uuid)
    else false
  end
);

drop policy if exists erp_record_photos_insert on storage.objects;
create policy erp_record_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects() and case
    when name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.projects where id = split_part(name, '/', 2)::uuid and archived_at is null)
    when name ~ '^warehouses/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.warehouses where id = split_part(name, '/', 2)::uuid)
    else false
  end
);

drop policy if exists erp_record_photos_update on storage.objects;
create policy erp_record_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects() and case
    when name ~ '^projects/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.projects where id = split_part(name, '/', 2)::uuid and archived_at is null)
    when name ~ '^warehouses/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.warehouses where id = split_part(name, '/', 2)::uuid)
    else false
  end
);

drop policy if exists erp_daily_report_photos_select on storage.objects;
create policy erp_daily_report_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^daily-reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (
        select 1 from public.daily_reports report
        where report.id = split_part(name, '/', 2)::uuid
          and private.can_view_daily_project_report(report.project_id)
      )
    else false
  end
);

drop policy if exists erp_daily_report_photos_insert on storage.objects;
create policy erp_daily_report_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^daily-reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (
        select 1 from public.daily_reports report
        where report.id = split_part(name, '/', 2)::uuid
          and report.status = 'draft' and report.prepared_by = (select auth.uid())
          and private.can_view_daily_project_report(report.project_id)
      )
    else false
  end
);

drop policy if exists erp_daily_report_photos_update on storage.objects;
create policy erp_daily_report_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^daily-reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (
        select 1 from public.daily_reports report
        where report.id = split_part(name, '/', 2)::uuid
          and report.status = 'draft' and report.prepared_by = (select auth.uid())
          and private.can_view_daily_project_report(report.project_id)
      )
    else false
  end
) with check (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^daily-reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (
        select 1 from public.daily_reports report
        where report.id = split_part(name, '/', 2)::uuid
          and report.status = 'draft' and report.prepared_by = (select auth.uid())
          and private.can_view_daily_project_report(report.project_id)
      )
    else false
  end
);

drop policy if exists erp_material_photos_select on storage.objects;
create policy erp_material_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.photo_path = name and material.archived_at is null)
    else false
  end
);

drop policy if exists erp_material_photos_insert on storage.objects;
create policy erp_material_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects() and case
    when name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.archived_at is null)
    else false
  end
);

drop policy if exists erp_material_photos_update on storage.objects;
create policy erp_material_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_projects()
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_projects() and case
    when name ~ '^materials/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.materials material where material.id = split_part(name, '/', 2)::uuid and material.archived_at is null)
    else false
  end
);

drop policy if exists erp_supplier_photos_select on storage.objects;
create policy erp_supplier_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and case
    when name ~ '^suppliers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.suppliers supplier where supplier.id = split_part(name, '/', 2)::uuid and supplier.photo_path = name)
    else false
  end
);

drop policy if exists erp_supplier_photos_insert on storage.objects;
create policy erp_supplier_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers() and case
    when name ~ '^suppliers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.suppliers supplier where supplier.id = split_part(name, '/', 2)::uuid and supplier.archived_at is null)
    else false
  end
);

drop policy if exists erp_supplier_photos_update on storage.objects;
create policy erp_supplier_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers()
) with check (
  bucket_id = 'erp-record-photos' and private.can_manage_suppliers() and case
    when name ~ '^suppliers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/cover[.]webp$'
      then exists (select 1 from public.suppliers supplier where supplier.id = split_part(name, '/', 2)::uuid and supplier.archived_at is null)
    else false
  end
);

drop policy if exists erp_profile_photos_manager_read on storage.objects;
create policy erp_profile_photos_manager_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-profile-photos' and private.can_manage_projects() and case
    when name ~ '^profiles/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar[.]webp$'
      then exists (
        select 1 from public.profiles profile
        where profile.id = split_part(name, '/', 2)::uuid and profile.avatar_path = name
      )
    else false
  end
);
