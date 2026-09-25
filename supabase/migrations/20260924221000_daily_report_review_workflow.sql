create function public.review_daily_report(p_report_id uuid, p_action text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_report public.daily_reports%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_status public.daily_report_status;
  v_event public.daily_report_event_type;
begin
  if v_actor is null or p_report_id is null or p_action is null or p_action not in ('approve', 'return') then
    raise exception 'invalid report review action' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 or (p_action = 'return' and char_length(coalesce(v_note, '')) < 3) then
    raise exception 'correction reason must be 3 to 500 characters' using errcode = '22023';
  end if;
  select * into v_report from public.daily_reports where id = p_report_id for update;
  if not found then raise exception 'report not found' using errcode = 'P0002'; end if;
  if v_report.prepared_by = v_actor or not exists (
    select 1 from public.profiles where id = v_actor and is_active and not onboarding_required
  ) or not (
    private.can_manage_projects() or (
      private.has_any_role(array['project_manager']::public.app_role[]) and exists (
        select 1 from public.project_assignments a where a.project_id = v_report.project_id
          and a.user_id = v_actor and a.status = 'active' and a.assignment_role = 'project_manager'
      )
    )
  ) then raise exception 'independent project manager review required' using errcode = '42501'; end if;
  if v_report.status <> 'submitted' then raise exception 'only submitted reports can be reviewed' using errcode = '55000'; end if;
  if p_action = 'approve' then
    v_status := 'approved'; v_event := 'approved';
    update public.daily_reports set status = v_status, approved_by = v_actor, approved_at = now()
      where id = p_report_id returning * into v_report;
  else
    v_status := 'requires_revision'; v_event := 'returned_for_correction';
    update public.daily_reports set status = v_status where id = p_report_id returning * into v_report;
  end if;
  insert into public.daily_report_events (report_id, revision, event_type, actor_id, report_snapshot)
    values (p_report_id, v_report.revision, v_event, v_actor,
      to_jsonb(v_report) || jsonb_build_object('review_note', v_note));
  perform private.enqueue_notification_event(
    'daily-report-review-' || p_report_id || '-' || v_report.revision, 'DAILY_REPORT',
    case when p_action = 'approve' then 'Daily report approved' else 'Daily report needs correction' end,
    case when p_action = 'approve' then 'Your daily report was approved.' else 'Your daily report was returned for correction.' end,
    'daily_report', p_report_id, v_report.project_id, null, 'normal',
    '{}'::public.app_role[], array[v_report.prepared_by], null
  );
  return p_report_id;
end; $$;

create function public.start_daily_report_correction(p_report_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_report public.daily_reports%rowtype;
begin
  if v_actor is null or p_report_id is null then raise exception 'authentication and report are required' using errcode = '28000'; end if;
  select * into v_report from public.daily_reports where id = p_report_id for update;
  if not found then raise exception 'report not found' using errcode = 'P0002'; end if;
  if v_report.prepared_by <> v_actor or not private.can_prepare_daily_project_report(v_report.project_id) then
    raise exception 'only the preparer can correct this report' using errcode = '42501';
  end if;
  if v_report.status = 'draft' then return p_report_id; end if;
  if v_report.status <> 'requires_revision' then raise exception 'report is not returned for correction' using errcode = '55000'; end if;
  update public.daily_reports set status = 'draft', submitted_at = null where id = p_report_id returning * into v_report;
  insert into public.daily_report_events (report_id, revision, event_type, actor_id, report_snapshot)
    values (p_report_id, v_report.revision, 'revision_started', v_actor, to_jsonb(v_report));
  return p_report_id;
end; $$;

revoke execute on function public.review_daily_report(uuid, text, text), public.start_daily_report_correction(uuid) from public, anon;
grant execute on function public.review_daily_report(uuid, text, text), public.start_daily_report_correction(uuid) to authenticated;

create function private.notify_daily_report_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_report public.daily_reports%rowtype;
begin
  if new.event_type <> 'submitted' then return new; end if;
  select * into v_report from public.daily_reports where id = new.report_id;
  perform private.enqueue_notification_event(
    'daily-report-submitted-' || new.report_id || '-' || new.revision, 'DAILY_REPORT',
    'Daily report awaiting review', 'A project daily report is ready for review.',
    'daily_report', new.report_id, v_report.project_id, null, 'normal',
    array['super_admin','owner','admin','project_manager']::public.app_role[], '{}'::uuid[], null
  );
  return new;
end; $$;
create trigger daily_report_submission_notification after insert on public.daily_report_events
  for each row execute function private.notify_daily_report_submission();
revoke execute on function private.notify_daily_report_submission() from public, anon, authenticated;
