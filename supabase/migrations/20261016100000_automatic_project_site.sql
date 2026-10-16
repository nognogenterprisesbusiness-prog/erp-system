-- Create the initial site in the same transaction as a new project.
-- Existing sites and their stock/history are not rewritten or duplicated.
begin;
create or replace function private.create_project_initial_site()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.project_sites (
    project_id, name, address, engineer_id, status, created_by, updated_by
  ) values (
    new.id, new.name, new.address, new.project_manager_id, 'active', new.created_by, new.updated_by
  );
  return new;
end;
$$;
revoke all on function private.create_project_initial_site() from public, anon, authenticated;
drop trigger if exists projects_initial_site on public.projects;
create trigger projects_initial_site after insert on public.projects
for each row execute function private.create_project_initial_site();
notify pgrst, 'reload schema';
commit;
