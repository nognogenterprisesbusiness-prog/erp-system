create or replace function public.assign_initial_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) then
    raise exception 'not authorized to assign a user role' using errcode = '42501';
  end if;
  if p_role in ('super_admin', 'owner') or
     (p_role = 'admin' and not private.has_any_role(array['super_admin', 'owner']::public.app_role[])) then
    raise exception 'not authorized to assign this role' using errcode = '42501';
  end if;
  if p_user_id = v_actor or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'target user is unavailable' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id) then
    raise exception 'target user already has a role' using errcode = '23505';
  end if;
  update public.profiles set is_active = false, onboarding_required = true where id = p_user_id;
  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, v_actor);
end;
$$;

create or replace function public.set_managed_user_active(p_user_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.has_any_role(array['super_admin', 'owner', 'admin']::public.app_role[]) then
    raise exception 'not authorized to manage users' using errcode = '42501';
  end if;
  if p_user_id is null or p_is_active is null or p_user_id = v_actor then
    raise exception 'invalid target user or status' using errcode = '22023';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role in ('super_admin', 'owner')) or
     (exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') and
      not private.has_any_role(array['super_admin', 'owner']::public.app_role[])) then
    raise exception 'not authorized to change this account' using errcode = '42501';
  end if;
  if p_is_active and exists (select 1 from public.profiles where id = p_user_id and onboarding_required) then
    raise exception 'password setup is still required' using errcode = '22023';
  end if;
  update public.profiles set is_active = p_is_active
  where id = p_user_id and is_active is distinct from p_is_active;
  if not found and not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'target user not found' using errcode = '22023';
  end if;
end;
$$;

create trigger profiles_audit after update on public.profiles
for each row execute function private.audit_row_change();

revoke all on function public.assign_initial_user_role(uuid, public.app_role) from public, anon;
revoke all on function public.set_managed_user_active(uuid, boolean) from public, anon;
grant execute on function public.assign_initial_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.set_managed_user_active(uuid, boolean) to authenticated;
