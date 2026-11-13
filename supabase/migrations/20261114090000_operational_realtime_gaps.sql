-- Refresh hints contain no truck, employee, receipt or financial details.
-- Driver assignment rows remain Admin-only and are not published (they can be deleted).
begin;

create table public.live_refresh_signals (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  topic text not null check (topic = 'driver_assignment'),
  revision uuid not null default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  unique (recipient_id, topic)
);
alter table public.live_refresh_signals enable row level security;
revoke all on public.live_refresh_signals from public, anon, authenticated;
grant select on public.live_refresh_signals to authenticated;
create policy live_refresh_signals_own_read on public.live_refresh_signals for select to authenticated
  using (recipient_id = (select auth.uid())
    and (select private.has_any_role(array['admin','driver']::public.app_role[])));

create function private.signal_driver_assignment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_driver uuid;
begin
  v_driver := case when tg_op = 'DELETE' then old.driver_id else new.driver_id end;
  insert into public.live_refresh_signals(recipient_id, topic)
    select p.id, 'driver_assignment' from public.profiles p
    where p.is_active and not p.onboarding_required and (p.id = v_driver or exists (
      select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin'))
  on conflict (recipient_id, topic) do update
    set revision = gen_random_uuid(), changed_at = clock_timestamp();
  return null;
end;
$$;
create trigger driver_assignment_live_refresh after insert or update or delete on public.driver_truck_assignments
  for each row execute function private.signal_driver_assignment_change();

create function private.signal_assigned_driver_asset_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_asset uuid;
begin
  if tg_table_name = 'assets' then v_asset := new.id; else v_asset := new.asset_id; end if;
  insert into public.live_refresh_signals(recipient_id, topic)
    select p.id, 'driver_assignment' from public.driver_truck_assignments d
    join public.profiles p on p.id = d.driver_id
    where d.asset_id = v_asset and p.is_active and not p.onboarding_required
  on conflict (recipient_id, topic) do update
    set revision = gen_random_uuid(), changed_at = clock_timestamp();
  return null;
end;
$$;
create trigger assigned_driver_asset_live_refresh after update on public.assets for each row
  when ((old.code, old.name, old.status, old.archived_at) is distinct from (new.code, new.name, new.status, new.archived_at))
  execute function private.signal_assigned_driver_asset_change();
create trigger assigned_driver_plate_live_refresh after update of plate_number on public.vehicle_details for each row
  when (old.plate_number is distinct from new.plate_number)
  execute function private.signal_assigned_driver_asset_change();
revoke all on function private.signal_driver_assignment_change(), private.signal_assigned_driver_asset_change()
  from public, anon, authenticated;

do $$
declare v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is missing';
  end if;
  foreach v_table in array array['asset_expenses', 'asset_events', 'attendance_scans', 'live_refresh_signals'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_table and c.relrowsecurity)
      or not exists (select 1 from pg_policies where schemaname='public' and tablename=v_table and cmd in ('SELECT','ALL'))
      or not has_column_privilege('authenticated', format('public.%I',v_table), 'id', 'SELECT') then
      raise exception 'Realtime source public.% requires authenticated, row-scoped SELECT', v_table;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end;
$$;
commit;
