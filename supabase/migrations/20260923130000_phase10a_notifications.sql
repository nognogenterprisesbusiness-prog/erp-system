create table public.notification_types (
  code text primary key check (code ~ '^[A-Z_]{3,40}$'),
  label text not null check (char_length(trim(label)) between 3 and 80),
  is_enabled boolean not null default true,
  is_sensitive boolean not null default false
);

insert into public.notification_types (code, label, is_sensitive) values
  ('MATERIAL_REQUEST', 'Material request', false),
  ('INVENTORY', 'Inventory', false),
  ('EQUIPMENT', 'Equipment', false),
  ('VEHICLE', 'Vehicle', false),
  ('LABOR', 'Labor', true),
  ('ATTENDANCE', 'Attendance', true),
  ('PROCUREMENT', 'Procurement', false),
  ('DAILY_REPORT', 'Daily report', false),
  ('PROJECT_PROGRESS', 'Project progress', false),
  ('FINANCIAL', 'Financial', true),
  ('SYSTEM', 'System', false);

create type public.notification_priority as enum ('low', 'normal', 'high');
create type public.notification_outbox_status as enum ('pending', 'retry', 'delivered', 'failed');

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(trim(event_key)) between 8 and 180),
  type_code text not null references public.notification_types(code) on delete restrict,
  title text not null check (char_length(trim(title)) between 3 and 160),
  message text not null check (char_length(trim(message)) between 3 and 500),
  entity_type text not null check (entity_type in ('material', 'equipment', 'vehicle', 'warehouse', 'project', 'project_site', 'daily_report', 'inventory_transaction', 'supplier', 'qr_code', 'system')),
  entity_id uuid,
  project_id uuid references public.projects(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  priority public.notification_priority not null default 'normal',
  recipient_roles public.app_role[] not null default '{}',
  recipient_user_ids uuid[] not null default '{}',
  expires_at timestamptz,
  status public.notification_outbox_status not null default 'pending',
  attempts smallint not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint notification_target_required check (entity_type = 'system' or entity_id is not null),
  constraint notification_recipient_required check (cardinality(recipient_roles) > 0 or cardinality(recipient_user_ids) > 0),
  constraint notification_expiry_after_creation check (expires_at is null or expires_at > created_at)
);
create index notification_outbox_due_idx on public.notification_outbox (next_attempt_at, created_at) where status in ('pending', 'retry');
create index notification_outbox_failed_idx on public.notification_outbox (created_at desc) where status = 'failed';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_outbox(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  type_code text not null references public.notification_types(code) on delete restrict,
  title text not null,
  message text not null,
  entity_type text not null,
  entity_id uuid,
  project_id uuid references public.projects(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  priority public.notification_priority not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (event_id, recipient_id)
);
create index notifications_recipient_recent_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id, created_at desc) where read_at is null;
create index notifications_type_recent_idx on public.notifications (type_code, created_at desc);

create table public.notification_read_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  read_at timestamptz not null default now()
);
create unique index notification_read_events_once_idx on public.notification_read_events (notification_id);

create or replace function private.notification_scope_allowed(p_type_code text, p_project_id uuid, p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
    and (p_project_id is null or private.can_access_project(p_project_id))
    and (p_warehouse_id is null or private.can_access_warehouse(p_warehouse_id))
    and (p_type_code not in ('FINANCIAL', 'LABOR', 'ATTENDANCE')
      or private.has_any_role(array['super_admin', 'owner', 'admin', 'accounting']::public.app_role[]))
$$;

create or replace function private.enqueue_notification_event(
  p_event_key text, p_type_code text, p_title text, p_message text,
  p_entity_type text, p_entity_id uuid, p_project_id uuid, p_warehouse_id uuid,
  p_priority public.notification_priority, p_recipient_roles public.app_role[],
  p_recipient_user_ids uuid[], p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing public.notification_outbox%rowtype;
begin
  if trim(coalesce(p_event_key, '')) = '' or trim(coalesce(p_title, '')) = '' or trim(coalesce(p_message, '')) = '' then
    raise exception 'notification event details are required' using errcode = '22023';
  end if;
  insert into public.notification_outbox (
    event_key, type_code, title, message, entity_type, entity_id, project_id, warehouse_id,
    priority, recipient_roles, recipient_user_ids, expires_at
  ) values (
    trim(p_event_key), p_type_code, trim(p_title), trim(p_message), p_entity_type, p_entity_id,
    p_project_id, p_warehouse_id, coalesce(p_priority, 'normal'),
    coalesce(p_recipient_roles, '{}'::public.app_role[]), coalesce(p_recipient_user_ids, '{}'::uuid[]), p_expires_at
  ) on conflict (event_key) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into v_existing from public.notification_outbox where event_key = trim(p_event_key);
  if (v_existing.type_code, v_existing.title, v_existing.message, v_existing.entity_type, v_existing.entity_id,
      v_existing.project_id, v_existing.warehouse_id, v_existing.priority, v_existing.recipient_roles,
      v_existing.recipient_user_ids, v_existing.expires_at)
    is distinct from (p_type_code, trim(p_title), trim(p_message), p_entity_type, p_entity_id,
      p_project_id, p_warehouse_id, coalesce(p_priority, 'normal'::public.notification_priority),
      coalesce(p_recipient_roles, '{}'::public.app_role[]), coalesce(p_recipient_user_ids, '{}'::uuid[]), p_expires_at) then
    raise exception 'notification event key was reused for another event' using errcode = '23505';
  end if;
  return v_existing.id;
end;
$$;

create or replace function private.process_notification_outbox(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_event public.notification_outbox%rowtype; v_recipients integer; v_processed integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid batch size' using errcode = '22023'; end if;
  for v_event in
    select * from public.notification_outbox
    where status in ('pending', 'retry') and next_attempt_at <= now()
    order by next_attempt_at, created_at limit p_limit for update skip locked
  loop
    begin
      if not exists (select 1 from public.notification_types where code = v_event.type_code and is_enabled) then
        raise exception 'notification type is disabled';
      end if;
      with eligible as (
        select distinct p.id from public.profiles p
        where p.is_active
          and (p.id = any(v_event.recipient_user_ids) or exists (
            select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = any(v_event.recipient_roles)
          ))
          and (v_event.project_id is null or exists (
            select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('super_admin', 'owner', 'admin')
          ) or exists (
            select 1 from public.project_assignments pa where pa.project_id = v_event.project_id and pa.user_id = p.id and pa.status = 'active'
          ))
          and (v_event.warehouse_id is null or exists (
            select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('super_admin', 'owner', 'admin')
          ) or exists (
            select 1 from public.warehouse_assignments wa where wa.warehouse_id = v_event.warehouse_id and wa.user_id = p.id and wa.status = 'active'
          ))
          and (v_event.type_code not in ('FINANCIAL', 'LABOR', 'ATTENDANCE') or exists (
            select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('super_admin', 'owner', 'admin', 'accounting')
          ))
      )
      insert into public.notifications (event_id, recipient_id, type_code, title, message, entity_type, entity_id, project_id, warehouse_id, priority, expires_at)
      select v_event.id, id, v_event.type_code, v_event.title, v_event.message, v_event.entity_type, v_event.entity_id,
        v_event.project_id, v_event.warehouse_id, v_event.priority, v_event.expires_at from eligible
      on conflict (event_id, recipient_id) do nothing;
      select count(*) into v_recipients from public.notifications where event_id = v_event.id;
      if v_recipients = 0 then raise exception 'no authorized recipients'; end if;
      update public.notification_outbox set status = 'delivered', attempts = attempts + 1,
        processed_at = now(), last_error = null where id = v_event.id;
      v_processed := v_processed + 1;
    exception when others then
      update public.notification_outbox set attempts = attempts + 1,
        status = case when attempts + 1 >= 5 then 'failed'::public.notification_outbox_status else 'retry'::public.notification_outbox_status end,
        next_attempt_at = now() + (interval '1 minute' * power(2, least(attempts, 5))),
        last_error = left(sqlerrm, 500) where id = v_event.id;
    end;
  end loop;
  return v_processed;
end;
$$;

create or replace function public.get_unread_notification_count()
returns bigint language sql stable security invoker set search_path = '' as $$
  select count(*) from public.notifications
  where recipient_id = auth.uid() and read_at is null and (expires_at is null or expires_at > now())
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_updated uuid;
begin
  update public.notifications set read_at = now()
  where id = p_notification_id and recipient_id = auth.uid() and read_at is null
    and private.notification_scope_allowed(type_code, project_id, warehouse_id)
  returning id into v_updated;
  if v_updated is not null then
    insert into public.notification_read_events (notification_id, recipient_id) values (v_updated, auth.uid());
    return true;
  end if;
  return exists (select 1 from public.notifications where id = p_notification_id and recipient_id = auth.uid()
    and private.notification_scope_allowed(type_code, project_id, warehouse_id));
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with changed as (
    update public.notifications set read_at = now()
    where recipient_id = auth.uid() and read_at is null and (expires_at is null or expires_at > now())
      and private.notification_scope_allowed(type_code, project_id, warehouse_id)
    returning id, recipient_id, read_at
  ), logged as (
    insert into public.notification_read_events (notification_id, recipient_id, read_at)
    select id, recipient_id, read_at from changed returning id
  ) select count(*) into v_count from logged;
  return v_count;
end;
$$;

alter table public.notification_types enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_read_events enable row level security;
revoke all on table public.notification_types, public.notification_outbox, public.notifications, public.notification_read_events from anon, authenticated;
grant select on table public.notification_types, public.notifications, public.notification_read_events to authenticated;
create policy notification_types_select on public.notification_types for select to authenticated using (is_enabled);
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and private.notification_scope_allowed(type_code, project_id, warehouse_id));
create policy notification_read_events_select_own on public.notification_read_events for select to authenticated
  using (recipient_id = (select auth.uid()) and exists (select 1 from public.notifications where id = notification_id));

revoke execute on function private.notification_scope_allowed(text, uuid, uuid),
  private.enqueue_notification_event(text, text, text, text, text, uuid, uuid, uuid, public.notification_priority, public.app_role[], uuid[], timestamptz),
  private.process_notification_outbox(integer) from public, anon, authenticated;
grant execute on function private.notification_scope_allowed(text, uuid, uuid) to authenticated;
revoke execute on function public.get_unread_notification_count(), public.mark_notification_read(uuid), public.mark_all_notifications_read() from public, anon;
grant execute on function public.get_unread_notification_count(), public.mark_notification_read(uuid), public.mark_all_notifications_read() to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('nognog-notification-outbox', '* * * * *', 'select private.process_notification_outbox(100)');
