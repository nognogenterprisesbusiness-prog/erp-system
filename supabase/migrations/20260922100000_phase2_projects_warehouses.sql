create type public.project_status as enum ('draft', 'active', 'on_hold', 'completed', 'cancelled');
create type public.assignment_role as enum ('project_manager', 'engineer', 'foreman', 'warehouse_staff', 'accounting', 'worker');
create type public.assignment_status as enum ('active', 'inactive');
create type public.warehouse_status as enum ('active', 'inactive');
create type public.site_status as enum ('active', 'inactive');
create type public.inventory_location_type as enum ('warehouse', 'project_site');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{2,32}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  client_name text not null check (char_length(trim(client_name)) between 2 and 160),
  client_email text,
  client_phone text,
  address text not null check (char_length(trim(address)) between 3 and 300),
  city_province text not null check (char_length(trim(city_province)) between 2 and 160),
  start_date date not null,
  target_completion_date date not null,
  actual_completion_date date,
  estimated_duration_days integer generated always as (target_completion_date - start_date) stored,
  contract_amount numeric(18,2) not null check (contract_amount >= 0),
  initial_budget numeric(18,2) not null check (initial_budget >= 0),
  status public.project_status not null default 'draft',
  project_manager_id uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_target_after_start check (target_completion_date >= start_date),
  constraint projects_actual_after_start check (actual_completion_date is null or actual_completion_date >= start_date),
  constraint projects_archive_pair check ((archived_at is null) = (archived_by is null))
);

create index projects_status_idx on public.projects (status) where archived_at is null;
create index projects_manager_idx on public.projects (project_manager_id) where archived_at is null;
create index projects_dates_idx on public.projects (start_date, target_completion_date);

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  assignment_role public.assignment_role not null,
  status public.assignment_status not null default 'active',
  assigned_on date not null default current_date,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_assignment_end_pair check ((ended_at is null) = (ended_by is null)),
  constraint project_assignment_status_end check ((status = 'active' and ended_at is null) or status = 'inactive')
);

create unique index project_assignments_active_unique
on public.project_assignments (project_id, user_id, assignment_role)
where status = 'active';
create index project_assignments_user_idx on public.project_assignments (user_id, status, project_id);
create index project_assignments_project_idx on public.project_assignments (project_id, status);

create or replace function private.sync_project_manager_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.project_manager_id is distinct from new.project_manager_id and old.project_manager_id is not null then
    update public.project_assignments
    set status = 'inactive', ended_at = now(), ended_by = new.updated_by
    where project_id = new.id and user_id = old.project_manager_id and assignment_role = 'project_manager' and status = 'active';
  end if;
  if new.project_manager_id is not null then
    insert into public.project_assignments (project_id, user_id, assignment_role, assigned_on, assigned_by)
    values (new.id, new.project_manager_id, 'project_manager', current_date, new.updated_by)
    on conflict (project_id, user_id, assignment_role) where status = 'active' do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_sync_manager after insert or update of project_manager_id on public.projects
for each row execute function private.sync_project_manager_assignment();

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{2,32}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  address text not null check (char_length(trim(address)) between 3 and 300),
  contact_person text,
  contact_number text,
  status public.warehouse_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index warehouses_status_idx on public.warehouses (status);

create table public.warehouse_assignments (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status public.assignment_status not null default 'active',
  assigned_on date not null default current_date,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_assignment_end_pair check ((ended_at is null) = (ended_by is null)),
  constraint warehouse_assignment_status_end check ((status = 'active' and ended_at is null) or status = 'inactive')
);

create unique index warehouse_assignments_active_unique
on public.warehouse_assignments (warehouse_id, user_id)
where status = 'active';
create index warehouse_assignments_user_idx on public.warehouse_assignments (user_id, status, warehouse_id);

create table public.project_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  address text not null check (char_length(trim(address)) between 3 and 300),
  description text check (description is null or char_length(description) <= 2000),
  engineer_id uuid references public.profiles(id) on delete restrict,
  foreman_id uuid references public.profiles(id) on delete restrict,
  status public.site_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index project_sites_project_idx on public.project_sites (project_id, status);

create table public.project_warehouses (
  project_id uuid not null references public.projects(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  authorized_by uuid not null references public.profiles(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  primary key (project_id, warehouse_id)
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  location_type public.inventory_location_type not null,
  warehouse_id uuid unique references public.warehouses(id) on delete restrict,
  project_site_id uuid unique references public.project_sites(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_location_source check (
    (location_type = 'warehouse' and warehouse_id is not null and project_site_id is null)
    or (location_type = 'project_site' and project_site_id is not null and warehouse_id is null)
  )
);

create or replace function private.can_manage_projects()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) $$;

create or replace function private.can_access_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_manage_projects() or exists (
    select 1 from public.project_assignments pa
    join public.profiles p on p.id = pa.user_id and p.is_active
    where pa.project_id = target_project_id
      and pa.user_id = (select auth.uid())
      and pa.status = 'active'
  )
$$;

create or replace function private.can_manage_warehouses()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) $$;

create or replace function private.can_access_warehouse(target_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.can_manage_warehouses() or exists (
    select 1 from public.warehouse_assignments wa
    join public.profiles p on p.id = wa.user_id and p.is_active
    where wa.warehouse_id = target_warehouse_id
      and wa.user_id = (select auth.uid())
      and wa.status = 'active'
  )
$$;

create or replace function private.can_view_assigned_profile(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or private.can_manage_projects()
    or exists (
      select 1
      from public.project_assignments mine
      join public.project_assignments theirs on theirs.project_id = mine.project_id and theirs.status = 'active'
      where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = target_profile_id
    )
    or exists (
      select 1
      from public.warehouse_assignments mine
      join public.warehouse_assignments theirs on theirs.warehouse_id = mine.warehouse_id and theirs.status = 'active'
      where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = target_profile_id
    )
$$;

create or replace function public.archive_project(p_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare archived_project public.projects;
begin
  if not private.can_manage_projects() then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.projects
  set archived_at = now(), archived_by = (select auth.uid()), updated_by = (select auth.uid())
  where id = p_project_id and archived_at is null
  returning * into archived_project;
  if archived_project.id is null then raise exception 'project not found or already archived' using errcode = 'P0002'; end if;
  return archived_project;
end;
$$;

create or replace function private.create_inventory_location()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'warehouses' then
    insert into public.inventory_locations (location_type, warehouse_id) values ('warehouse', new.id);
  else
    insert into public.inventory_locations (location_type, project_site_id) values ('project_site', new.id);
  end if;
  return new;
end;
$$;

create trigger warehouse_inventory_location after insert on public.warehouses
for each row execute function private.create_inventory_location();
create trigger project_site_inventory_location after insert on public.project_sites
for each row execute function private.create_inventory_location();

create trigger projects_set_updated_at before update on public.projects for each row execute function private.set_updated_at();
create trigger project_assignments_set_updated_at before update on public.project_assignments for each row execute function private.set_updated_at();
create trigger warehouses_set_updated_at before update on public.warehouses for each row execute function private.set_updated_at();
create trigger warehouse_assignments_set_updated_at before update on public.warehouse_assignments for each row execute function private.set_updated_at();
create trigger project_sites_set_updated_at before update on public.project_sites for each row execute function private.set_updated_at();

create trigger projects_audit after insert or update or delete on public.projects for each row execute function private.audit_row_change();
create trigger project_assignments_audit after insert or update or delete on public.project_assignments for each row execute function private.audit_row_change();
create trigger warehouses_audit after insert or update or delete on public.warehouses for each row execute function private.audit_row_change();
create trigger warehouse_assignments_audit after insert or update or delete on public.warehouse_assignments for each row execute function private.audit_row_change();
create trigger project_sites_audit after insert or update or delete on public.project_sites for each row execute function private.audit_row_change();

alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.warehouses enable row level security;
alter table public.warehouse_assignments enable row level security;
alter table public.project_sites enable row level security;
alter table public.project_warehouses enable row level security;
alter table public.inventory_locations enable row level security;

revoke all on table public.projects, public.project_assignments, public.warehouses, public.warehouse_assignments, public.project_sites, public.project_warehouses, public.inventory_locations from anon, authenticated;
grant select, insert, update on table public.projects, public.project_assignments, public.warehouses, public.warehouse_assignments, public.project_sites, public.project_warehouses to authenticated;
grant select on table public.inventory_locations to authenticated;

create policy profiles_select_assigned on public.profiles for select to authenticated using ((select private.can_view_assigned_profile(id)));

create policy projects_select_authorized on public.projects for select to authenticated using ((select auth.uid()) is not null and private.can_access_project(id));
create policy projects_insert_admin on public.projects for insert to authenticated with check (private.can_manage_projects() and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy projects_update_admin on public.projects for update to authenticated using (private.can_manage_projects()) with check (private.can_manage_projects() and updated_by = (select auth.uid()));

create policy project_assignments_select_authorized on public.project_assignments for select to authenticated using (user_id = (select auth.uid()) or private.can_access_project(project_id));
create policy project_assignments_insert_admin on public.project_assignments for insert to authenticated with check (private.can_manage_projects() and assigned_by = (select auth.uid()));
create policy project_assignments_update_admin on public.project_assignments for update to authenticated using (private.can_manage_projects()) with check (private.can_manage_projects());

create policy warehouses_select_authorized on public.warehouses for select to authenticated using ((select auth.uid()) is not null and private.can_access_warehouse(id));
create policy warehouses_insert_admin on public.warehouses for insert to authenticated with check (private.can_manage_warehouses() and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy warehouses_update_admin on public.warehouses for update to authenticated using (private.can_manage_warehouses()) with check (private.can_manage_warehouses() and updated_by = (select auth.uid()));

create policy warehouse_assignments_select_authorized on public.warehouse_assignments for select to authenticated using (user_id = (select auth.uid()) or private.can_access_warehouse(warehouse_id));
create policy warehouse_assignments_insert_admin on public.warehouse_assignments for insert to authenticated with check (private.can_manage_warehouses() and assigned_by = (select auth.uid()));
create policy warehouse_assignments_update_admin on public.warehouse_assignments for update to authenticated using (private.can_manage_warehouses()) with check (private.can_manage_warehouses());

create policy project_sites_select_authorized on public.project_sites for select to authenticated using (private.can_access_project(project_id));
create policy project_sites_insert_admin on public.project_sites for insert to authenticated with check (private.can_manage_projects() and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy project_sites_update_admin on public.project_sites for update to authenticated using (private.can_manage_projects()) with check (private.can_manage_projects() and updated_by = (select auth.uid()));

create policy project_warehouses_select_authorized on public.project_warehouses for select to authenticated using (private.can_access_project(project_id) or private.can_access_warehouse(warehouse_id));
create policy project_warehouses_insert_admin on public.project_warehouses for insert to authenticated with check (private.can_manage_projects() and authorized_by = (select auth.uid()));
create policy project_warehouses_update_admin on public.project_warehouses for update to authenticated using (private.can_manage_projects()) with check (private.can_manage_projects());

create policy inventory_locations_select_authorized on public.inventory_locations for select to authenticated using (
  (warehouse_id is not null and private.can_access_warehouse(warehouse_id))
  or (project_site_id is not null and exists (select 1 from public.project_sites ps where ps.id = project_site_id and private.can_access_project(ps.project_id)))
);

revoke execute on function public.archive_project(uuid) from public, anon;
grant execute on function public.archive_project(uuid) to authenticated;
revoke execute on function private.can_manage_projects(), private.can_access_project(uuid), private.can_manage_warehouses(), private.can_access_warehouse(uuid), private.can_view_assigned_profile(uuid), private.create_inventory_location(), private.sync_project_manager_assignment() from public, anon;
grant execute on function private.can_manage_projects(), private.can_access_project(uuid), private.can_manage_warehouses(), private.can_access_warehouse(uuid), private.can_view_assigned_profile(uuid) to authenticated;
revoke execute on function private.create_inventory_location() from authenticated;
revoke execute on function private.sync_project_manager_assignment() from authenticated;
