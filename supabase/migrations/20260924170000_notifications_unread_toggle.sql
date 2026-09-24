-- A recipient may revisit a notification without erasing the first-read audit event.
create or replace function public.mark_all_notifications_unread()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with changed as (
    update public.notifications set read_at = null
    where recipient_id = auth.uid() and read_at is not null
      and (expires_at is null or expires_at > now())
      and private.notification_scope_allowed(type_code, project_id, warehouse_id)
    returning id
  ) select count(*) into v_count from changed;
  return v_count;
end;
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
    insert into public.notification_read_events (notification_id, recipient_id)
    values (v_updated, auth.uid()) on conflict (notification_id) do nothing;
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
    select id, recipient_id, read_at from changed
    on conflict (notification_id) do nothing returning id
  ) select count(*) into v_count from changed;
  return v_count;
end;
$$;

revoke execute on function public.mark_all_notifications_unread() from public, anon;
grant execute on function public.mark_all_notifications_unread() to authenticated;
