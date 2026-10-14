-- Retire phone delivery only. The notification inbox/outbox and its history stay intact.
begin;
do $$
declare v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for v_job_id in execute 'select jobid from cron.job where jobname = ''nognog-prune-push-tokens'''
    loop
      execute 'select cron.unschedule($1)' using v_job_id;
    end loop;
  end if;
end $$;
drop trigger if exists notifications_send_push on public.notifications;
drop function if exists private.send_notification_push();
drop function if exists private.prune_invalid_push_tokens();
drop function if exists public.register_mobile_push_token(text,text);
drop function if exists public.unregister_mobile_push_token(text);
drop table if exists public.mobile_push_tokens;
notify pgrst, 'reload schema';
commit;
