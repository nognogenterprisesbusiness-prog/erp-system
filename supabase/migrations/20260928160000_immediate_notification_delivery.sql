-- Deliver newly enqueued notifications in the inserting transaction so live
-- subscribers do not wait for the minute-based retry worker. The scheduled
-- worker remains responsible for retrying transient failures.

create or replace function private.deliver_notification_outbox_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.notification_outbox%rowtype;
  v_recipients integer;
begin
  select * into v_event
  from public.notification_outbox
  where id = p_event_id
    and status in ('pending', 'retry')
    and next_attempt_at <= now()
  for update skip locked;

  if not found then
    return false;
  end if;

  begin
    if not exists (
      select 1 from public.notification_types
      where code = v_event.type_code and is_enabled
    ) then
      raise exception 'notification type is disabled';
    end if;

    with eligible as (
      select distinct p.id
      from public.profiles p
      where p.is_active
        and (
          p.id = any(v_event.recipient_user_ids)
          or exists (
            select 1 from public.user_roles ur
            where ur.user_id = p.id and ur.role = any(v_event.recipient_roles)
          )
        )
        and (
          v_event.project_id is null
          or exists (
            select 1 from public.user_roles ur
            where ur.user_id = p.id and ur.role = 'admin'
          )
          or exists (
            select 1 from public.project_assignments pa
            where pa.project_id = v_event.project_id
              and pa.user_id = p.id
              and pa.status = 'active'
          )
        )
        and (
          v_event.warehouse_id is null
          or exists (
            select 1 from public.user_roles ur
            where ur.user_id = p.id and ur.role = 'admin'
          )
          or exists (
            select 1 from public.warehouse_assignments wa
            where wa.warehouse_id = v_event.warehouse_id
              and wa.user_id = p.id
              and wa.status = 'active'
          )
        )
        and (
          v_event.type_code not in ('FINANCIAL', 'LABOR', 'ATTENDANCE')
          or exists (
            select 1 from public.user_roles ur
            where ur.user_id = p.id and ur.role = 'admin'
          )
        )
    )
    insert into public.notifications (
      event_id, recipient_id, type_code, title, message, entity_type,
      entity_id, project_id, warehouse_id, priority, expires_at
    )
    select
      v_event.id, eligible.id, v_event.type_code, v_event.title, v_event.message,
      v_event.entity_type, v_event.entity_id, v_event.project_id,
      v_event.warehouse_id, v_event.priority, v_event.expires_at
    from eligible
    on conflict (event_id, recipient_id) do nothing;

    select count(*) into v_recipients
    from public.notifications
    where event_id = v_event.id;

    if v_recipients = 0 then
      raise exception 'no authorized recipients';
    end if;

    update public.notification_outbox
    set status = 'delivered',
        attempts = attempts + 1,
        processed_at = now(),
        last_error = null
    where id = v_event.id;

    return true;
  exception when others then
    update public.notification_outbox
    set attempts = attempts + 1,
        status = case
          when attempts + 1 >= 5 then 'failed'::public.notification_outbox_status
          else 'retry'::public.notification_outbox_status
        end,
        next_attempt_at = now() + (interval '1 minute' * power(2, least(attempts, 5))),
        last_error = left(sqlerrm, 500)
    where id = v_event.id;

    return false;
  end;
end;
$$;

create or replace function private.deliver_notification_outbox_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.deliver_notification_outbox_event(new.id);
  return new;
end;
$$;

drop trigger if exists notification_outbox_deliver_after_insert on public.notification_outbox;
create trigger notification_outbox_deliver_after_insert
after insert on public.notification_outbox
for each row execute function private.deliver_notification_outbox_insert();

-- Keep the scheduled worker as a recovery path, but share its delivery logic
-- with the immediate trigger so recipient authorization cannot drift.
create or replace function private.process_notification_outbox(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_processed integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid batch size' using errcode = '22023';
  end if;

  for v_event_id in
    select id
    from public.notification_outbox
    where status in ('pending', 'retry') and next_attempt_at <= now()
    order by next_attempt_at, created_at
    limit p_limit
    for update skip locked
  loop
    if private.deliver_notification_outbox_event(v_event_id) then
      v_processed := v_processed + 1;
    end if;
  end loop;

  return v_processed;
end;
$$;

revoke all on function private.deliver_notification_outbox_event(uuid),
  private.deliver_notification_outbox_insert() from public, anon, authenticated;
revoke execute on function private.process_notification_outbox(integer) from public, anon, authenticated;
