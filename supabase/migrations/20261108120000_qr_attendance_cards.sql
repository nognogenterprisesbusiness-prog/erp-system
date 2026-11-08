-- Worker ID cards with a QR code, scanned by the assigned Foreman for time-in/time-out.
-- Scans are evidence only: they never post project cost. The Foreman still posts attendance through
-- post_project_attendance_batch, so labour cost stays posted once with its rate snapshot.

create table public.employee_id_cards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  public_identifier text not null unique default ('NW-' || upper(replace(gen_random_uuid()::text, '-', '')))
    check (public_identifier ~ '^NW-[A-F0-9]{32}$'),
  status text not null default 'active' check (status in ('active', 'replaced')),
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  replaced_by uuid references public.profiles(id) on delete restrict,
  replaced_at timestamptz,
  replace_reason text check (replace_reason is null or char_length(trim(replace_reason)) between 3 and 500),
  constraint employee_id_cards_replacement check (
    (status = 'active' and replaced_at is null and replaced_by is null and replace_reason is null)
    or (status = 'replaced' and replaced_at is not null and replaced_by is not null and replace_reason is not null))
);
create unique index employee_id_cards_one_active on public.employee_id_cards (employee_id) where status = 'active';
create index employee_id_cards_history on public.employee_id_cards (employee_id, issued_at desc);

create table public.attendance_scans (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  card_id uuid not null references public.employee_id_cards(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  assignment_id uuid not null references public.employee_project_assignments(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null references public.project_sites(id) on delete restrict,
  work_date date not null,
  scan_type text not null check (scan_type in ('in', 'out')),
  scanned_at timestamptz not null default now(),
  scanned_by uuid not null references public.profiles(id) on delete restrict
);
create index attendance_scans_employee_day on public.attendance_scans (employee_id, project_id, work_date, scanned_at desc);
create index attendance_scans_site_day on public.attendance_scans (project_id, project_site_id, work_date);

alter table public.employee_id_cards enable row level security;
alter table public.attendance_scans enable row level security;
revoke all on public.employee_id_cards, public.attendance_scans from public, anon, authenticated;
grant select on public.employee_id_cards, public.attendance_scans to authenticated;
create policy employee_id_cards_admin_read on public.employee_id_cards for select to authenticated
  using (private.has_any_role(array['admin']::public.app_role[]));
create policy attendance_scans_read on public.attendance_scans for select to authenticated
  using (private.can_record_project_attendance(project_id));

create trigger employee_id_cards_audit after insert or update or delete on public.employee_id_cards
for each row execute function private.audit_row_change();

create function private.attendance_scans_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Attendance scans cannot be changed' using errcode = '42501';
end;
$$;
create trigger attendance_scans_append_only before update or delete on public.attendance_scans
for each row execute function private.attendance_scans_append_only();

-- Every employee gets a card automatically; Admin only prints it.
create function private.issue_employee_id_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.employee_id_cards (employee_id, issued_by) values (new.id, new.created_by);
  return new;
end;
$$;
create trigger employees_issue_id_card after insert on public.employees
for each row execute function private.issue_employee_id_card();
insert into public.employee_id_cards (employee_id, issued_by)
select e.id, e.created_by from public.employees e
where not exists (select 1 from public.employee_id_cards c where c.employee_id = e.id and c.status = 'active');
revoke all on function private.issue_employee_id_card(), private.attendance_scans_append_only() from public, anon, authenticated;

create function public.replace_employee_id_card(p_employee_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.has_any_role(array['admin']::public.app_role[]) then
    raise exception 'Only an administrator can replace ID cards' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Enter a reason of 3 to 500 characters' using errcode = '22023';
  end if;
  perform 1 from public.employees where id = p_employee_id and archived_at is null for update;
  if not found then raise exception 'Employee not found' using errcode = '22023'; end if;
  update public.employee_id_cards set status = 'replaced', replaced_at = now(), replaced_by = v_actor,
    replace_reason = trim(p_reason)
  where employee_id = p_employee_id and status = 'active';
  insert into public.employee_id_cards (employee_id, issued_by) values (p_employee_id, v_actor) returning id into v_id;
  return v_id;
end;
$$;

-- One worker's scans for one project and day: first time-in, last time-out and hours between pairs.
create function private.attendance_scan_summary(p_employee_id uuid, p_project_id uuid, p_work_date date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with scans as (
    select s.*, lead(s.scan_type) over w as next_type, lead(s.scanned_at) over w as next_at,
      row_number() over (order by s.scanned_at desc, s.id desc) as recent
    from public.attendance_scans s
    where s.employee_id = p_employee_id and s.project_id = p_project_id and s.work_date = p_work_date
    window w as (order by s.scanned_at, s.id)
  ), latest as (select * from scans where recent = 1)
  select jsonb_build_object(
    'employee_id', e.id,
    'name', concat(e.first_name, ' ', e.last_name),
    'code', e.code,
    'assignment_id', l.assignment_id,
    'project_site_id', l.project_site_id,
    'work_date', p_work_date,
    'basis', coalesce(b.rate_type, (select case when count(distinct r.rate_type) = 1 then min(r.rate_type::text) end
      from public.labor_rates r where r.employee_id = e.id and r.effective_start_date <= p_work_date
        and (r.effective_end_date is null or r.effective_end_date >= p_work_date))::public.labor_rate_type),
    'time_in', (select min(scanned_at) from scans where scan_type = 'in'),
    'time_out', case when l.scan_type = 'out' then l.scanned_at end,
    'last_scan', l.scan_type,
    'last_scanned_at', l.scanned_at,
    'hours', least(24, round(coalesce((select sum(extract(epoch from (next_at - scanned_at)) / 3600)
      from scans where scan_type = 'in' and next_type = 'out'), 0)::numeric, 2)),
    'recorded', exists (select 1 from public.project_attendance a
      left join public.project_attendance_reversals r on r.attendance_id = a.id
      where a.employee_id = e.id and a.project_id = p_project_id and a.work_date = p_work_date and r.id is null))
  from latest l
  join public.employees e on e.id = p_employee_id
  left join public.employee_attendance_basis b on b.employee_id = e.id
$$;

create function public.record_attendance_scan(p_idempotency_key uuid, p_project_id uuid, p_site_id uuid, p_card text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_card public.employee_id_cards;
  v_employee public.employees;
  v_assignment public.employee_project_assignments;
  v_existing public.attendance_scans;
  v_last public.attendance_scans;
  v_type text;
begin
  if v_actor is null or p_project_id is null or p_site_id is null
    or not private.can_record_project_attendance(p_project_id)
    or not private.mobile_site_role(p_project_id, p_site_id, 'foreman') then
    raise exception 'Only the assigned Foreman can scan attendance for this site' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'Invalid scan' using errcode = '22023'; end if;
  if p_card is null or upper(trim(p_card)) !~ '^NW-[A-F0-9]{32}$' then
    raise exception 'This is not a worker ID card' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_card from public.employee_id_cards where public_identifier = upper(trim(p_card));
  select * into v_existing from public.attendance_scans where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.scanned_by <> v_actor or v_existing.card_id is distinct from v_card.id
      or v_existing.project_id <> p_project_id or v_existing.project_site_id <> p_site_id then
      raise exception 'Idempotency key already used for another scan' using errcode = '23505';
    end if;
    return private.attendance_scan_summary(v_existing.employee_id, v_existing.project_id, v_existing.work_date)
      || jsonb_build_object('scan_type', v_existing.scan_type, 'repeated', false);
  end if;
  if v_card.id is null then raise exception 'ID card not recognised' using errcode = '22023'; end if;
  if v_card.status <> 'active' then
    raise exception 'This ID card was replaced. Use the worker''s new card.' using errcode = '22023';
  end if;
  -- Serialise scans for one worker so two phones cannot both record a time-in.
  select * into v_employee from public.employees where id = v_card.employee_id for update;
  if v_employee.archived_at is not null or v_employee.status <> 'active' then
    raise exception '% is not an active employee', concat(v_employee.first_name, ' ', v_employee.last_name) using errcode = '22023';
  end if;
  select * into v_assignment from public.employee_project_assignments a
  where a.employee_id = v_employee.id and a.project_id = p_project_id and a.project_site_id = p_site_id
    and a.start_date <= v_today and (a.end_date is null or a.end_date >= v_today)
  order by a.start_date desc limit 1;
  if v_assignment.id is null then
    raise exception '% is not assigned to this site today', concat(v_employee.first_name, ' ', v_employee.last_name)
      using errcode = '22023';
  end if;
  if exists (select 1 from public.project_attendance a
    left join public.project_attendance_reversals r on r.attendance_id = a.id
    where a.employee_id = v_employee.id and a.project_id = p_project_id and a.work_date = v_today and r.id is null) then
    raise exception 'Attendance for % is already recorded today', concat(v_employee.first_name, ' ', v_employee.last_name)
      using errcode = '23505';
  end if;
  select * into v_last from public.attendance_scans
  where employee_id = v_employee.id and project_id = p_project_id and work_date = v_today
  order by scanned_at desc, id desc limit 1;
  -- A card held in front of the camera twice within five minutes counts once.
  if v_last.id is not null and v_last.scanned_at > now() - interval '5 minutes' then
    return private.attendance_scan_summary(v_employee.id, p_project_id, v_today)
      || jsonb_build_object('scan_type', v_last.scan_type, 'repeated', true);
  end if;
  v_type := case when v_last.scan_type = 'in' then 'out' else 'in' end;
  insert into public.attendance_scans (idempotency_key, card_id, employee_id, assignment_id, project_id,
    project_site_id, work_date, scan_type, scanned_by)
  values (p_idempotency_key, v_card.id, v_employee.id, v_assignment.id, p_project_id, p_site_id, v_today, v_type, v_actor);
  return private.attendance_scan_summary(v_employee.id, p_project_id, v_today)
    || jsonb_build_object('scan_type', v_type, 'repeated', false);
end;
$$;

create function public.get_attendance_scans(p_project_id uuid, p_site_id uuid)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if (select auth.uid()) is null or not private.can_record_project_attendance(p_project_id)
    or not private.mobile_site_role(p_project_id, p_site_id, 'foreman') then
    raise exception 'Only the assigned Foreman can view scans for this site' using errcode = '42501';
  end if;
  return query
    select private.attendance_scan_summary(w.employee_id, p_project_id, v_today)
    from (select distinct s.employee_id from public.attendance_scans s
      where s.project_id = p_project_id and s.project_site_id = p_site_id and s.work_date = v_today) w
    join public.employees e on e.id = w.employee_id
    order by e.last_name, e.first_name, e.id
    limit 300;
end;
$$;

revoke all on function private.attendance_scan_summary(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.replace_employee_id_card(uuid, text), public.record_attendance_scan(uuid, uuid, uuid, text),
  public.get_attendance_scans(uuid, uuid) from public, anon;
grant execute on function public.replace_employee_id_card(uuid, text), public.record_attendance_scan(uuid, uuid, uuid, text),
  public.get_attendance_scans(uuid, uuid) to authenticated;
