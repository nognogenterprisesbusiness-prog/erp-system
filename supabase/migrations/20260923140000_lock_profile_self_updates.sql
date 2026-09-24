-- A profile owner may edit contact details, never their account status or identity.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()) and is_active);
