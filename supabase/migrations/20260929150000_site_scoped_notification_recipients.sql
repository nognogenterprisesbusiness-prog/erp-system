-- Notifications for a project were delivered only to users with a
-- project-level assignment, so Foremen and Engineers assigned to a site
-- (project_sites.foreman_id / engineer_id) received none: no in-app alert and
-- no push. Recognize site assignments with the same rule the app uses for
-- site-scoped access (private.can_view_assigned_project). Everything else in
-- the delivery function is unchanged.

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
          -- Site-assigned Foremen and Engineers belong to the project too.
          or exists (
            select 1 from public.project_sites ps
            join public.user_roles site_role on site_role.user_id = p.id
            where ps.project_id = v_event.project_id
              and ps.status = 'active'
              and ((ps.foreman_id = p.id and site_role.role = 'foreman')
                or (ps.engineer_id = p.id and site_role.role = 'engineer'))
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

revoke all on function private.deliver_notification_outbox_event(uuid) from public, anon, authenticated;
