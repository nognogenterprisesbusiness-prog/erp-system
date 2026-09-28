create or replace function private.guard_report_activity_edit() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_report public.daily_reports; v_report_id uuid;
begin
  v_report_id:=case when tg_op='DELETE' then old.report_id else new.report_id end;
  select * into v_report from public.daily_reports where id=v_report_id for update;
  if v_report.id is null or auth.uid() is null
    or not private.can_view_mobile_site(v_report.project_id,v_report.project_site_id)
    or (v_report.prepared_by<>auth.uid() and not private.has_any_role(array['admin']::public.app_role[])) then
    raise exception 'Only the report preparer or an administrator can change linked activity' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_report_activity_edit() from public,anon,authenticated;

comment on function private.guard_report_activity_edit() is
  'Serializes report-resource edits and restricts them to the report preparer or an administrator; link changes remain audited after report submission.';
