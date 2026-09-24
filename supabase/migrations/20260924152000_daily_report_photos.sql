alter table public.daily_reports
  add column photo_path text
  constraint daily_reports_photo_path_matches_id check (photo_path is null or photo_path = 'daily-reports/' || id::text || '/cover.webp');

create policy erp_daily_report_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'erp-record-photos' and name ~ '^daily-reports/[0-9a-f-]{36}/cover[.]webp$'
  and exists (
    select 1 from public.daily_reports report
    where report.id = split_part(name, '/', 2)::uuid
      and private.can_view_daily_project_report(report.project_id)
  )
);

create policy erp_daily_report_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-record-photos' and name ~ '^daily-reports/[0-9a-f-]{36}/cover[.]webp$'
  and exists (
    select 1 from public.daily_reports report
    where report.id = split_part(name, '/', 2)::uuid
      and report.status = 'draft' and report.prepared_by = (select auth.uid())
      and private.can_view_daily_project_report(report.project_id)
  )
);

create policy erp_daily_report_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-record-photos' and name ~ '^daily-reports/[0-9a-f-]{36}/cover[.]webp$'
  and exists (
    select 1 from public.daily_reports report
    where report.id = split_part(name, '/', 2)::uuid
      and report.status = 'draft' and report.prepared_by = (select auth.uid())
      and private.can_view_daily_project_report(report.project_id)
  )
) with check (
  bucket_id = 'erp-record-photos' and name ~ '^daily-reports/[0-9a-f-]{36}/cover[.]webp$'
  and exists (
    select 1 from public.daily_reports report
    where report.id = split_part(name, '/', 2)::uuid
      and report.status = 'draft' and report.prepared_by = (select auth.uid())
      and private.can_view_daily_project_report(report.project_id)
  )
);

create function public.attach_daily_report_photo(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_report public.daily_reports;
  v_path text := 'daily-reports/' || p_report_id::text || '/cover.webp';
begin
  select * into v_report from public.daily_reports where id = p_report_id for update;
  if v_report.id is null or v_report.status <> 'draft' or v_report.prepared_by <> (select auth.uid())
    or not private.can_prepare_daily_project_report(v_report.project_id) then
    raise exception 'not authorized to attach this report photo' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'erp-record-photos' and name = v_path) then
    raise exception 'report photo upload is missing' using errcode = '22023';
  end if;
  update public.daily_reports set photo_path = v_path where id = p_report_id;
end;
$$;

revoke execute on function public.attach_daily_report_photo(uuid) from public, anon;
grant execute on function public.attach_daily_report_photo(uuid) to authenticated;
