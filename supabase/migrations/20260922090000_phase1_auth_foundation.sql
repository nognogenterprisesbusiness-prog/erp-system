create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum (
  'super_admin',
  'owner',
  'admin',
  'project_manager',
  'engineer',
  'foreman',
  'warehouse_staff',
  'accounting',
  'worker'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  email text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique on public.profiles (lower(email));

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.has_any_role(required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.is_active
    where ur.user_id = (select auth.uid())
      and ur.role = any(required_roles)
  );
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  previous_data jsonb;
  current_data jsonb;
begin
  target_id := case when tg_op = 'DELETE' then old.id else new.id end;
  previous_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  current_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  -- Keep audit evidence of the changed record without copying sensitive contact
  -- details or private storage paths into a long-lived general audit table.
  previous_data := previous_data - array['email','client_email','client_phone','phone','contact_number',
    'email_address','contact_person','tax_identification_number','avatar_path','photo_path'];
  current_data := current_data - array['email','client_email','client_phone','phone','contact_number',
    'email_address','contact_person','tax_identification_number','avatar_path','photo_path'];
  insert into public.audit_logs (actor_id, table_name, record_id, action, old_data, new_data)
  values (
    (select auth.uid()),
    tg_table_name,
    target_id,
    lower(tg_op),
    previous_data,
    current_data
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function private.audit_user_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, table_name, record_id, action, old_data, new_data)
    values (
      auth.uid(), 'user_roles', case when tg_op = 'DELETE' then old.user_id else new.user_id end,
      lower(tg_op), case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
      case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
    );
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function private.audit_user_role_change();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.profiles, public.user_roles, public.audit_logs from anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.user_roles, public.audit_logs to authenticated;

create policy profiles_select_self_or_admin
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]))
);

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy user_roles_select_self_or_admin
on public.user_roles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]))
);

create policy audit_logs_select_admin
on public.audit_logs for select to authenticated
using ((select private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[])));

revoke execute on function private.has_any_role(public.app_role[]) from public, anon;
grant execute on function private.has_any_role(public.app_role[]) to authenticated;
revoke execute on function private.audit_row_change() from public, anon, authenticated;
revoke execute on function private.audit_user_role_change() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.set_updated_at() from public, anon, authenticated;
