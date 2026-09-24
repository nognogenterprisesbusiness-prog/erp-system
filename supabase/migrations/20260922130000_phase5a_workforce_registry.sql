create type public.employee_status as enum ('active', 'inactive', 'on_leave', 'separated');
create type public.workforce_assignment_status as enum ('active', 'ended');
create type public.labor_rate_type as enum ('hourly', 'daily');
create type public.employee_event_type as enum (
  'registered', 'details_updated', 'status_changed', 'profile_linked', 'archived',
  'assignment_started', 'assignment_ended', 'assignment_transferred', 'rate_added', 'rate_closed'
);

create table public.employee_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_categories_archive_pair check ((archived_at is null) = (archived_by is null))
);
create unique index employee_categories_name_unique on public.employee_categories (lower(name)) where archived_at is null;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{2,32}$'),
  first_name text not null check (char_length(trim(first_name)) between 2 and 80),
  middle_name text check (middle_name is null or char_length(trim(middle_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 2 and 80),
  category_id uuid not null references public.employee_categories(id) on delete restrict,
  employment_type text not null check (char_length(trim(employment_type)) between 2 and 80),
  status public.employee_status not null default 'active',
  hire_date date not null,
  profile_id uuid unique references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_archive_pair check ((archived_at is null) = (archived_by is null)),
  constraint employees_archived_status check (archived_at is null or status = 'separated')
);
create index employees_status_idx on public.employees (status, last_name, first_name) where archived_at is null;
create index employees_category_idx on public.employees (category_id, status) where archived_at is null;
create index employees_name_idx on public.employees (last_name, first_name) where archived_at is null;

-- Contact data is deliberately separated so project workforce viewers do not receive private phone data.
create table public.employee_private_contacts (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  contact_number text not null check (char_length(trim(contact_number)) between 7 and 40 and contact_number ~ '^[0-9+() .-]+$'),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.employee_project_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_site_id uuid not null references public.project_sites(id) on delete restrict,
  position_title text not null check (char_length(trim(position_title)) between 2 and 120),
  start_date date not null,
  end_date date,
  status public.workforce_assignment_status not null default 'active',
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  ended_by uuid references public.profiles(id) on delete restrict,
  remarks text check (remarks is null or char_length(remarks) <= 2000),
  end_remarks text check (end_remarks is null or char_length(end_remarks) <= 2000),
  transferred_from_assignment_id uuid references public.employee_project_assignments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_project_assignment_dates check (end_date is null or end_date >= start_date),
  constraint employee_project_assignment_end_pair check ((end_date is null) = (ended_by is null)),
  constraint employee_project_assignment_status_end check (
    (status = 'active' and end_date is null and ended_by is null)
    or (status = 'ended' and end_date is not null and ended_by is not null)
  )
);
create unique index employee_project_assignments_active_unique
  on public.employee_project_assignments (employee_id, project_id, project_site_id)
  where status = 'active';
create index employee_project_assignments_employee_idx on public.employee_project_assignments (employee_id, status, start_date desc);
create index employee_project_assignments_project_idx on public.employee_project_assignments (project_id, status, project_site_id);

create table public.labor_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  rate_type public.labor_rate_type not null,
  rate_amount numeric(18,2) not null check (rate_amount > 0),
  effective_start_date date not null,
  effective_end_date date,
  approved_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_rate_dates check (effective_end_date is null or effective_end_date >= effective_start_date)
);
create index labor_rates_employee_idx on public.labor_rates (employee_id, rate_type, effective_start_date desc);

create table public.employee_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  event_type public.employee_event_type not null,
  previous_status public.employee_status,
  current_status public.employee_status,
  summary text not null check (char_length(trim(summary)) between 2 and 500),
  details jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index employee_events_employee_idx on public.employee_events (employee_id, occurred_at desc);

create or replace function private.can_manage_workforce()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) $$;

create or replace function private.can_view_workforce_financials()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['super_admin', 'owner', 'admin', 'accounting']::public.app_role[]) $$;

create or replace function private.can_view_employee(target_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_view_workforce_financials()
    or exists (
      select 1 from public.employees e
      where e.id = target_employee_id and e.profile_id = (select auth.uid())
    )
    or exists (
      select 1 from public.employee_project_assignments epa
      where epa.employee_id = target_employee_id and private.can_access_project(epa.project_id)
    )
$$;

create or replace function private.record_employee_event(
  p_employee_id uuid,
  p_event_type public.employee_event_type,
  p_previous_status public.employee_status,
  p_current_status public.employee_status,
  p_summary text,
  p_details jsonb,
  p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.employee_events (employee_id, event_type, previous_status, current_status, summary, details, actor_id)
  values (p_employee_id, p_event_type, p_previous_status, p_current_status, trim(p_summary), coalesce(p_details, '{}'::jsonb), p_actor);
end;
$$;

create or replace function private.validate_workforce_assignment_references(
  p_employee_id uuid, p_project_id uuid, p_project_site_id uuid
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.employees
    where id = p_employee_id and archived_at is null and status = 'active'
  ) then
    raise exception 'employee is unavailable for assignment' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.projects
    where id = p_project_id and archived_at is null and status not in ('completed', 'cancelled')
  ) then
    raise exception 'project is unavailable for assignment' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.project_sites
    where id = p_project_site_id and project_id = p_project_id and status = 'active'
  ) then
    raise exception 'project site is unavailable or belongs to another project' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.prevent_labor_rate_overlap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.labor_rates lr
    where lr.employee_id = new.employee_id
      and lr.rate_type = new.rate_type
      and lr.id <> new.id
      and daterange(lr.effective_start_date, coalesce(lr.effective_end_date, 'infinity'::date), '[]')
          && daterange(new.effective_start_date, coalesce(new.effective_end_date, 'infinity'::date), '[]')
  ) then
    raise exception 'labor rate effective dates overlap an existing rate' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger labor_rates_prevent_overlap before insert or update on public.labor_rates
  for each row execute function private.prevent_labor_rate_overlap();

create or replace function public.save_employee_category(p_id uuid, p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_name)) not between 2 and 120 then raise exception 'invalid employee category name' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.employee_categories (name, description, created_by, updated_by)
    values (trim(p_name), nullif(trim(p_description), ''), v_actor, v_actor) returning id into v_id;
  else
    update public.employee_categories
    set name = trim(p_name), description = nullif(trim(p_description), ''), updated_by = v_actor
    where id = p_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'employee category not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_employee_category(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if exists (select 1 from public.employees where category_id = p_id and archived_at is null) then
    raise exception 'reassign or archive active employee records before archiving this category' using errcode = '23503';
  end if;
  update public.employee_categories set archived_at = now(), archived_by = v_actor, updated_by = v_actor
  where id = p_id and archived_at is null;
  if not found then raise exception 'employee category not found or already archived' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.save_employee(
  p_id uuid, p_code text, p_first_name text, p_middle_name text, p_last_name text,
  p_contact_number text, p_category_id uuid, p_employment_type text,
  p_status public.employee_status, p_hire_date date, p_profile_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_old public.employees;
  v_event public.employee_event_type;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_status = 'separated' then raise exception 'use the archive workflow to separate an employee' using errcode = '22023'; end if;
  if trim(p_code) !~ '^[A-Z0-9-]{2,32}$'
    or char_length(trim(p_first_name)) not between 2 and 80
    or char_length(trim(p_last_name)) not between 2 and 80
    or char_length(trim(p_contact_number)) not between 7 and 40
    or trim(p_contact_number) !~ '^[0-9+() .-]+$'
    or char_length(trim(p_employment_type)) not between 2 and 80
  then raise exception 'invalid employee values' using errcode = '22023'; end if;
  if not exists (select 1 from public.employee_categories where id = p_category_id and archived_at is null) then
    raise exception 'employee category is missing or archived' using errcode = '22023';
  end if;
  if p_profile_id is not null and not exists (select 1 from public.profiles where id = p_profile_id and is_active) then
    raise exception 'linked user account is unavailable' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.employees (
      code, first_name, middle_name, last_name, category_id, employment_type, status,
      hire_date, profile_id, created_by, updated_by
    ) values (
      trim(p_code), trim(p_first_name), nullif(trim(p_middle_name), ''), trim(p_last_name), p_category_id,
      trim(p_employment_type), p_status, p_hire_date, p_profile_id, v_actor, v_actor
    ) returning id into v_id;
    insert into public.employee_private_contacts (employee_id, contact_number, updated_by)
    values (v_id, trim(p_contact_number), v_actor);
    perform private.record_employee_event(v_id, 'registered', null, p_status, 'Employee registered', jsonb_build_object('code', trim(p_code)), v_actor);
  else
    select * into v_old from public.employees where id = p_id and archived_at is null for update;
    if v_old.id is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    update public.employees set
      code = trim(p_code), first_name = trim(p_first_name), middle_name = nullif(trim(p_middle_name), ''),
      last_name = trim(p_last_name), category_id = p_category_id, employment_type = trim(p_employment_type),
      status = p_status, hire_date = p_hire_date, profile_id = p_profile_id, updated_by = v_actor
    where id = p_id;
    update public.employee_private_contacts
    set contact_number = trim(p_contact_number), updated_by = v_actor, updated_at = now()
    where employee_id = p_id;
    if not found then
      insert into public.employee_private_contacts (employee_id, contact_number, updated_by)
      values (p_id, trim(p_contact_number), v_actor);
    end if;
    v_id := p_id;
    v_event := case
      when v_old.status <> p_status then 'status_changed'
      when v_old.profile_id is distinct from p_profile_id then 'profile_linked'
      else 'details_updated'
    end;
    perform private.record_employee_event(v_id, v_event, v_old.status, p_status, 'Employee record updated', jsonb_build_object('code', trim(p_code)), v_actor);
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_employee(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old public.employees;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_reason)) not between 3 and 500 then raise exception 'archive reason is required' using errcode = '22023'; end if;
  select * into v_old from public.employees where id = p_id and archived_at is null for update;
  if v_old.id is null then raise exception 'employee not found or already archived' using errcode = 'P0002'; end if;
  if exists (select 1 from public.employee_project_assignments where employee_id = p_id and status = 'active') then
    raise exception 'end active project assignments before archiving this employee' using errcode = '22023';
  end if;
  update public.employees
  set status = 'separated', archived_at = now(), archived_by = v_actor, updated_by = v_actor
  where id = p_id;
  perform private.record_employee_event(p_id, 'archived', v_old.status, 'separated', trim(p_reason), '{}'::jsonb, v_actor);
end;
$$;

create or replace function public.assign_employee_to_project(
  p_employee_id uuid, p_project_id uuid, p_project_site_id uuid,
  p_position_title text, p_start_date date, p_remarks text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if char_length(trim(p_position_title)) not between 2 and 120 then raise exception 'invalid assigned position' using errcode = '22023'; end if;
  perform private.validate_workforce_assignment_references(p_employee_id, p_project_id, p_project_site_id);
  insert into public.employee_project_assignments (
    employee_id, project_id, project_site_id, position_title, start_date, assigned_by, remarks
  ) values (
    p_employee_id, p_project_id, p_project_site_id, trim(p_position_title), p_start_date, v_actor, nullif(trim(p_remarks), '')
  ) returning id into v_id;
  perform private.record_employee_event(
    p_employee_id, 'assignment_started', null, null, 'Project workforce assignment started',
    jsonb_build_object('assignment_id', v_id, 'project_id', p_project_id, 'project_site_id', p_project_site_id), v_actor
  );
  return v_id;
end;
$$;

create or replace function public.end_employee_project_assignment(
  p_assignment_id uuid, p_end_date date, p_remarks text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_assignment public.employee_project_assignments;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_assignment from public.employee_project_assignments where id = p_assignment_id and status = 'active' for update;
  if v_assignment.id is null then raise exception 'active workforce assignment not found' using errcode = 'P0002'; end if;
  if p_end_date < v_assignment.start_date then raise exception 'assignment end date precedes start date' using errcode = '22023'; end if;
  update public.employee_project_assignments set
    status = 'ended', end_date = p_end_date, ended_by = v_actor,
    end_remarks = nullif(trim(p_remarks), '')
  where id = p_assignment_id;
  perform private.record_employee_event(
    v_assignment.employee_id, 'assignment_ended', null, null, 'Project workforce assignment ended',
    jsonb_build_object('assignment_id', p_assignment_id, 'project_id', v_assignment.project_id), v_actor
  );
end;
$$;

create or replace function public.transfer_employee_assignment(
  p_assignment_id uuid, p_new_project_id uuid, p_new_project_site_id uuid,
  p_new_position_title text, p_current_end_date date, p_new_start_date date, p_remarks text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old public.employee_project_assignments; v_new_id uuid;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_old from public.employee_project_assignments where id = p_assignment_id and status = 'active' for update;
  if v_old.id is null then raise exception 'active workforce assignment not found' using errcode = 'P0002'; end if;
  if p_current_end_date < v_old.start_date or p_new_start_date <= p_current_end_date then
    raise exception 'transfer dates must end the current assignment before the new one starts' using errcode = '22023';
  end if;
  if char_length(trim(p_new_position_title)) not between 2 and 120 then raise exception 'invalid assigned position' using errcode = '22023'; end if;
  perform private.validate_workforce_assignment_references(v_old.employee_id, p_new_project_id, p_new_project_site_id);
  update public.employee_project_assignments set
    status = 'ended', end_date = p_current_end_date, ended_by = v_actor,
    end_remarks = 'Transferred to a new workforce assignment'
  where id = p_assignment_id;
  insert into public.employee_project_assignments (
    employee_id, project_id, project_site_id, position_title, start_date, assigned_by, remarks, transferred_from_assignment_id
  ) values (
    v_old.employee_id, p_new_project_id, p_new_project_site_id, trim(p_new_position_title), p_new_start_date,
    v_actor, nullif(trim(p_remarks), ''), p_assignment_id
  ) returning id into v_new_id;
  perform private.record_employee_event(
    v_old.employee_id, 'assignment_transferred', null, null, 'Employee transferred between workforce assignments',
    jsonb_build_object('from_assignment_id', p_assignment_id, 'to_assignment_id', v_new_id, 'project_id', p_new_project_id, 'project_site_id', p_new_project_site_id), v_actor
  );
  return v_new_id;
end;
$$;

create or replace function public.post_labor_rate(
  p_employee_id uuid, p_rate_type public.labor_rate_type, p_rate_amount numeric,
  p_effective_start_date date, p_effective_end_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_rate_amount <= 0 or (p_effective_end_date is not null and p_effective_end_date < p_effective_start_date) then
    raise exception 'invalid labor rate values' using errcode = '22023';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and archived_at is null) then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text || ':' || p_rate_type::text, 0));
  insert into public.labor_rates (
    employee_id, rate_type, rate_amount, effective_start_date, effective_end_date, approved_by
  ) values (
    p_employee_id, p_rate_type, p_rate_amount, p_effective_start_date, p_effective_end_date, v_actor
  ) returning id into v_id;
  perform private.record_employee_event(p_employee_id, 'rate_added', null, null, 'Labor rate version added', '{}'::jsonb, v_actor);
  return v_id;
end;
$$;

create or replace function public.close_labor_rate(p_rate_id uuid, p_effective_end_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_rate public.labor_rates;
begin
  if v_actor is null or not private.can_manage_workforce() then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_rate from public.labor_rates where id = p_rate_id and effective_end_date is null for update;
  if v_rate.id is null then raise exception 'open labor rate not found' using errcode = 'P0002'; end if;
  if p_effective_end_date < v_rate.effective_start_date then raise exception 'labor rate end date precedes start date' using errcode = '22023'; end if;
  update public.labor_rates set effective_end_date = p_effective_end_date where id = p_rate_id;
  perform private.record_employee_event(v_rate.employee_id, 'rate_closed', null, null, 'Labor rate version closed', '{}'::jsonb, v_actor);
end;
$$;

create trigger employee_categories_set_updated_at before update on public.employee_categories for each row execute function private.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute function private.set_updated_at();
create trigger employee_project_assignments_set_updated_at before update on public.employee_project_assignments for each row execute function private.set_updated_at();
create trigger labor_rates_set_updated_at before update on public.labor_rates for each row execute function private.set_updated_at();

create trigger employee_categories_audit after insert or update or delete on public.employee_categories for each row execute function private.audit_row_change();
create trigger employees_audit after insert or update or delete on public.employees for each row execute function private.audit_row_change();
create trigger employee_project_assignments_audit after insert or update or delete on public.employee_project_assignments for each row execute function private.audit_row_change();
create trigger labor_rates_audit after insert or update or delete on public.labor_rates for each row execute function private.audit_row_change();
create trigger employee_events_audit after insert on public.employee_events for each row execute function private.audit_row_change();

alter table public.employee_categories enable row level security;
alter table public.employees enable row level security;
alter table public.employee_private_contacts enable row level security;
alter table public.employee_project_assignments enable row level security;
alter table public.labor_rates enable row level security;
alter table public.employee_events enable row level security;

revoke all on table public.employee_categories, public.employees, public.employee_private_contacts,
  public.employee_project_assignments, public.labor_rates, public.employee_events from anon, authenticated;
grant select on table public.employee_categories, public.employees, public.employee_private_contacts,
  public.employee_project_assignments, public.labor_rates, public.employee_events to authenticated;

create policy employee_categories_select_authenticated on public.employee_categories for select to authenticated using ((select auth.uid()) is not null);
create policy employees_select_authorized on public.employees for select to authenticated using (private.can_view_employee(id));
create policy employee_private_contacts_select_restricted on public.employee_private_contacts for select to authenticated using (
  private.can_view_workforce_financials()
  or exists (select 1 from public.employees e where e.id = employee_id and e.profile_id = (select auth.uid()))
);
create policy employee_project_assignments_select_authorized on public.employee_project_assignments for select to authenticated using (
  private.can_view_workforce_financials()
  or private.can_access_project(project_id)
  or exists (select 1 from public.employees e where e.id = employee_id and e.profile_id = (select auth.uid()))
);
create policy labor_rates_select_restricted on public.labor_rates for select to authenticated using (
  private.can_view_workforce_financials()
  or exists (select 1 from public.employees e where e.id = employee_id and e.profile_id = (select auth.uid()))
);
create policy employee_events_select_authorized on public.employee_events for select to authenticated using (private.can_view_employee(employee_id));

revoke execute on function private.can_manage_workforce(), private.can_view_workforce_financials(), private.can_view_employee(uuid),
  private.record_employee_event(uuid, public.employee_event_type, public.employee_status, public.employee_status, text, jsonb, uuid),
  private.validate_workforce_assignment_references(uuid, uuid, uuid), private.prevent_labor_rate_overlap()
from public, anon, authenticated;
grant execute on function private.can_manage_workforce(), private.can_view_workforce_financials(), private.can_view_employee(uuid) to authenticated;

revoke execute on function public.save_employee_category(uuid, text, text), public.archive_employee_category(uuid),
  public.save_employee(uuid, text, text, text, text, text, uuid, text, public.employee_status, date, uuid),
  public.archive_employee(uuid, text), public.assign_employee_to_project(uuid, uuid, uuid, text, date, text),
  public.end_employee_project_assignment(uuid, date, text),
  public.transfer_employee_assignment(uuid, uuid, uuid, text, date, date, text),
  public.post_labor_rate(uuid, public.labor_rate_type, numeric, date, date), public.close_labor_rate(uuid, date)
from public, anon;
grant execute on function public.save_employee_category(uuid, text, text), public.archive_employee_category(uuid),
  public.save_employee(uuid, text, text, text, text, text, uuid, text, public.employee_status, date, uuid),
  public.archive_employee(uuid, text), public.assign_employee_to_project(uuid, uuid, uuid, text, date, text),
  public.end_employee_project_assignment(uuid, date, text),
  public.transfer_employee_assignment(uuid, uuid, uuid, text, date, date, text),
  public.post_labor_rate(uuid, public.labor_rate_type, numeric, date, date), public.close_labor_rate(uuid, date)
to authenticated;
