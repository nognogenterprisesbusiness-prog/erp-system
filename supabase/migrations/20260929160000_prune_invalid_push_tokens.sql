-- Remove push tokens for phones that uninstalled the app or revoked permission.
-- Expo answers each push with a ticket; DeviceNotRegistered tickets name the
-- dead token. pg_net keeps recent responses in net._http_response.
create function private.prune_invalid_push_tokens()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_removed integer := 0;
begin
  begin
    with dead as (
      select distinct ticket -> 'details' ->> 'expoPushToken' as token
      from net._http_response response,
        jsonb_array_elements(
          case when jsonb_typeof(response.content::jsonb -> 'data') = 'array'
            then response.content::jsonb -> 'data' else '[]'::jsonb end
        ) ticket
      where response.created > now() - interval '1 day'
        and response.content like '%DeviceNotRegistered%'
        and ticket -> 'details' ->> 'error' = 'DeviceNotRegistered'
    )
    delete from public.mobile_push_tokens token using dead where token.token = dead.token;
    get diagnostics v_removed = row_count;
  exception when others then
    raise warning 'Push token cleanup skipped: %', sqlerrm;
  end;
  return v_removed;
end;
$$;
revoke all on function private.prune_invalid_push_tokens() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('nognog-prune-push-tokens', '15 * * * *', 'select private.prune_invalid_push_tokens()');
exception when others then
  raise warning 'pg_cron unavailable; run private.prune_invalid_push_tokens() periodically: %', sqlerrm;
end;
$$;
