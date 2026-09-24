create type public.daily_report_status as enum (
  'draft', 'submitted', 'pending_review', 'approved', 'rejected', 'requires_revision'
);
create type public.daily_report_event_type as enum ('created', 'draft_updated', 'submitted');

create sequence public.daily_report_number_seq;
create unique index project_sites_project_id_id_unique on public.project_sites (project_id, id);

create table public.daily_reports (
  id uuid primary key,
  report_number text not null unique default ('DR-' || nextval('public.daily_report_number_seq')::text),
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null,
  report_date date not null,
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  status public.daily_report_status not null default 'draft',
  weather_conditions text check (weather_conditions is null or char_length(weather_conditions) <= 300),
  work_description text not null default '' check (char_length(work_description) <= 5000),
  accomplishments text not null default '' check (char_length(accomplishments) <= 5000),
  issues_encountered text check (issues_encountered is null or char_length(issues_encountered) <= 5000),
  site_observations text check (site_observations is null or char_length(site_observations) <= 5000),
  general_remarks text check (general_remarks is null or char_length(general_remarks) <= 5000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  constraint daily_reports_project_site_fk foreign key (project_id, project_site_id)
    references public.project_sites(project_id, id) on delete restrict,
  constraint daily_report_submission_state check (
    (status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null)
  ),
  constraint daily_report_approval_pair check ((approved_at is null) = (approved_by is null))
);
create index daily_reports_project_date_idx on public.daily_reports (project_id, report_date desc);
create index daily_reports_site_date_idx on public.daily_reports (project_site_id, report_date desc);
create index daily_reports_status_date_idx on public.daily_reports (status, report_date desc);
create index daily_reports_preparer_idx on public.daily_reports (prepared_by, created_at desc);

create table public.daily_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete restrict,
  revision integer not null,
  event_type public.daily_report_event_type not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  report_snapshot jsonb not null,
  occurred_at timestamptz not null default now(),
  unique (report_id, revision, event_type)
);
create index daily_report_events_report_idx on public.daily_report_events (report_id, occurred_at desc);

create or replace function private.can_view_daily_project_report(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_projects() or exists (
    select 1 from public.project_assignments pa
    join public.profiles p on p.id = pa.user_id and p.is_active
    join public.user_roles ur on ur.user_id = pa.user_id and ur.role::text = pa.assignment_role::text
    where pa.project_id = p_project_id and pa.user_id = (select auth.uid())
      and pa.status = 'active' and pa.assignment_role in ('project_manager', 'engineer', 'foreman')
  )
$$;

create or replace function private.can_prepare_daily_project_report(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_view_daily_project_report(p_project_id)
$$;

create or replace function public.save_daily_report(
  p_id uuid, p_project_id uuid, p_project_site_id uuid, p_report_date date,
  p_weather_conditions text, p_work_description text, p_accomplishments text,
  p_issues_encountered text, p_site_observations text, p_general_remarks text,
  p_submit boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.daily_reports;
  v_saved public.daily_reports;
  v_is_new boolean;
begin
  if v_actor is null or not private.can_prepare_daily_project_report(p_project_id) then
    raise exception 'not authorized to prepare this project report' using errcode = '42501';
  end if;
  if p_id is null or p_project_id is null or p_project_site_id is null or p_report_date is null then
    raise exception 'project, site, report identifier, and date are required' using errcode = '22023';
  end if;
  if p_submit is null then raise exception 'report action is required' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.projects p join public.project_sites ps on ps.project_id = p.id
    where p.id = p_project_id and ps.id = p_project_site_id
      and p.archived_at is null and p.status in ('active', 'on_hold') and ps.status = 'active'
  ) then
    raise exception 'project or site is unavailable' using errcode = '22023';
  end if;
  if char_length(coalesce(p_weather_conditions, '')) > 300
    or char_length(coalesce(p_work_description, '')) > 5000
    or char_length(coalesce(p_accomplishments, '')) > 5000
    or char_length(coalesce(p_issues_encountered, '')) > 5000
    or char_length(coalesce(p_site_observations, '')) > 5000
    or char_length(coalesce(p_general_remarks, '')) > 5000
  then raise exception 'report text exceeds the allowed length' using errcode = '22023'; end if;
  if p_submit and (char_length(trim(coalesce(p_work_description, ''))) < 3 or char_length(trim(coalesce(p_accomplishments, ''))) < 3) then
    raise exception 'work description and accomplishments are required for submission' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_current from public.daily_reports where id = p_id for update;
  v_is_new := v_current.id is null;
  if not v_is_new then
    if v_current.prepared_by <> v_actor or v_current.project_id <> p_project_id then
      raise exception 'report identity does not match this project or preparer' using errcode = '42501';
    end if;
    if v_current.status = 'submitted' and p_submit then
      return p_id;
    end if;
    if v_current.status <> 'draft' then
      raise exception 'only draft reports can be edited' using errcode = '55000';
    end if;
  end if;

  if v_is_new then
    insert into public.daily_reports (
      id, project_id, project_site_id, report_date, prepared_by, weather_conditions,
      work_description, accomplishments, issues_encountered, site_observations,
      general_remarks, status, submitted_at
    ) values (
      p_id, p_project_id, p_project_site_id, p_report_date, v_actor, nullif(trim(p_weather_conditions), ''),
      trim(coalesce(p_work_description, '')), trim(coalesce(p_accomplishments, '')),
      nullif(trim(p_issues_encountered), ''), nullif(trim(p_site_observations), ''),
      nullif(trim(p_general_remarks), ''), case when p_submit then 'submitted'::public.daily_report_status else 'draft'::public.daily_report_status end,
      case when p_submit then now() end
    ) returning * into v_saved;
  else
    update public.daily_reports set
      project_site_id = p_project_site_id, report_date = p_report_date,
      weather_conditions = nullif(trim(p_weather_conditions), ''),
      work_description = trim(coalesce(p_work_description, '')),
      accomplishments = trim(coalesce(p_accomplishments, '')),
      issues_encountered = nullif(trim(p_issues_encountered), ''),
      site_observations = nullif(trim(p_site_observations), ''),
      general_remarks = nullif(trim(p_general_remarks), ''),
      revision = revision + 1,
      status = case when p_submit then 'submitted'::public.daily_report_status else 'draft'::public.daily_report_status end,
      submitted_at = case when p_submit then now() end
    where id = p_id returning * into v_saved;
  end if;

  insert into public.daily_report_events (report_id, revision, event_type, actor_id, report_snapshot)
  values (p_id, v_saved.revision,
    case when v_is_new then 'created'::public.daily_report_event_type else 'draft_updated'::public.daily_report_event_type end,
    v_actor, to_jsonb(v_saved));
  if p_submit then
    insert into public.daily_report_events (report_id, revision, event_type, actor_id, report_snapshot)
    values (p_id, v_saved.revision, 'submitted', v_actor, to_jsonb(v_saved));
  end if;
  return p_id;
end;
$$;

create trigger daily_reports_set_updated_at before update on public.daily_reports
  for each row execute function private.set_updated_at();
create trigger daily_reports_audit after insert or update or delete on public.daily_reports
  for each row execute function private.audit_row_change();
create trigger daily_report_events_audit after insert on public.daily_report_events
  for each row execute function private.audit_row_change();

alter table public.daily_reports enable row level security;
alter table public.daily_report_events enable row level security;
revoke all on table public.daily_reports, public.daily_report_events from anon, authenticated;
grant select on table public.daily_reports, public.daily_report_events to authenticated;
create policy daily_reports_select_authorized on public.daily_reports for select to authenticated
  using (private.can_view_daily_project_report(project_id));
create policy daily_report_events_select_authorized on public.daily_report_events for select to authenticated
  using (exists (select 1 from public.daily_reports dr where dr.id = report_id and private.can_view_daily_project_report(dr.project_id)));

revoke execute on function private.can_view_daily_project_report(uuid), private.can_prepare_daily_project_report(uuid) from public, anon, authenticated;
grant execute on function private.can_view_daily_project_report(uuid) to authenticated;
revoke execute on function public.save_daily_report(uuid, uuid, uuid, date, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_daily_report(uuid, uuid, uuid, date, text, text, text, text, text, text, boolean) to authenticated;
