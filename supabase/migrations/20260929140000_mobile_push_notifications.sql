-- Mobile push notifications. Each in-app notification is also sent to the
-- recipient's registered phones through the Expo push service. Delivery is
-- best effort: it never blocks or rolls back the notification itself.

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise warning 'pg_net is unavailable; push notifications stay disabled: %', sqlerrm;
end;
$$;

create table public.mobile_push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index mobile_push_tokens_user_idx on public.mobile_push_tokens (user_id);
alter table public.mobile_push_tokens enable row level security;
revoke all on public.mobile_push_tokens from public, anon, authenticated;

-- A device token belongs to whoever signed in on it last.
create function public.register_mobile_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.mobile_push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.unregister_mobile_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.mobile_push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.register_mobile_push_token(text, text), public.unregister_mobile_push_token(text) from public, anon;
grant execute on function public.register_mobile_push_token(text, text), public.unregister_mobile_push_token(text) to authenticated;

create function private.send_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', new.title,
    'body', new.message,
    'sound', 'default',
    'channelId', 'default',
    'priority', case when new.priority = 'high' then 'high' else 'default' end,
    'data', jsonb_build_object('notificationId', new.id, 'entityType', new.entity_type, 'entityId', new.entity_id)
  ))
  into v_messages
  from public.mobile_push_tokens t
  join public.profiles p on p.id = t.user_id and p.is_active
  where t.user_id = new.recipient_id;

  if v_messages is null then
    return new;
  end if;
  begin
    -- pg_net queues the request and sends it after commit, outside this transaction.
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_messages,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'Push delivery skipped for notification %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function private.send_notification_push() from public, anon, authenticated;

create trigger notifications_send_push
after insert on public.notifications
for each row execute function private.send_notification_push();
