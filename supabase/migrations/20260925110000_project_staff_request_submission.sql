-- A material request starts with assigned site staff; managers review and approve it.
-- Enforce this even when the security-definer submission RPC is called directly.
create function private.enforce_material_request_submitter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.requested_by is distinct from auth.uid()
     or private.has_any_role(array['admin']::public.app_role[])
     or not private.has_any_role(array['engineer','foreman']::public.app_role[])
     or not exists (
       select 1 from public.project_assignments assignment
       where assignment.project_id = new.project_id
         and assignment.user_id = auth.uid()
         and assignment.status = 'active'
         and assignment.assignment_role in ('engineer','foreman')
     ) then
    raise exception 'only assigned project staff can submit material requests' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_material_request_submitter() from public, anon, authenticated;
create trigger material_requests_require_project_staff
before insert on public.material_requests
for each row execute function private.enforce_material_request_submitter();
