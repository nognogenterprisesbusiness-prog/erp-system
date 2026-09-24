create or replace function private.can_view_assigned_profile(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or (
      private.has_any_role(enum_range(null::public.app_role))
      and (
        private.can_manage_projects()
        or exists (
          select 1 from public.project_assignments mine
          join public.project_assignments theirs on theirs.project_id = mine.project_id and theirs.status = 'active'
          where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = target_profile_id
        )
        or exists (
          select 1 from public.warehouse_assignments mine
          join public.warehouse_assignments theirs on theirs.warehouse_id = mine.warehouse_id and theirs.status = 'active'
          where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = target_profile_id
        )
      )
    )
$$;
