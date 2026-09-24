alter table public.profiles
  add column avatar_path text
  constraint profiles_avatar_path_matches_id check (avatar_path is null or avatar_path = 'profiles/' || id::text || '/avatar.webp');

revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

create or replace function private.sync_auth_user_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row execute function private.sync_auth_user_email();
revoke execute on function private.sync_auth_user_email() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('erp-profile-photos', 'erp-profile-photos', false, 2000000, array['image/webp'])
on conflict (id) do nothing;

create policy erp_profile_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'erp-profile-photos' and name = 'profiles/' || (select auth.uid())::text || '/avatar.webp'
);
create policy erp_profile_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-profile-photos' and name = 'profiles/' || (select auth.uid())::text || '/avatar.webp'
);
create policy erp_profile_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'erp-profile-photos' and name = 'profiles/' || (select auth.uid())::text || '/avatar.webp'
) with check (
  bucket_id = 'erp-profile-photos' and name = 'profiles/' || (select auth.uid())::text || '/avatar.webp'
);
