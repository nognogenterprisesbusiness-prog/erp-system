-- Disposable PostgreSQL test adapter for the Auth/Storage schema contracts.
-- This is not an Auth, Storage, Realtime or notification service emulator.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz,updated_at timestamptz,
  confirmation_token text,email_change text,email_change_token_new text,recovery_token text
);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth,storage,extensions to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz default now());
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create publication supabase_realtime;

create table auth.identities(id uuid default gen_random_uuid(),provider_id text,user_id uuid references auth.users(id),identity_data jsonb,provider text,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);
create unique index identities_provider_unique on auth.identities(provider_id,provider);
