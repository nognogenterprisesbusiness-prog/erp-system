-- Consolidate dashboard counts into one RLS-scoped scan and one API request.
begin;
create function public.get_dashboard_project_counts()
returns table(total bigint, active bigint, on_hold bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return query select count(*), count(*) filter (where p.status = 'active'),
    count(*) filter (where p.status = 'on_hold')
    from public.projects p where p.archived_at is null;
end;
$$;
revoke all on function public.get_dashboard_project_counts() from public, anon;
grant execute on function public.get_dashboard_project_counts() to authenticated;
notify pgrst, 'reload schema';
commit;
