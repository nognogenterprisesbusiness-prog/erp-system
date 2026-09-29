create type public.project_document_category as enum ('initial', 'other');

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  category public.project_document_category not null,
  file_name text not null check (char_length(trim(file_name)) between 1 and 180),
  content_type text not null check (content_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  )),
  file_size integer not null check (file_size between 1 and 10485760),
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint project_document_storage_path_matches_ids
    check (storage_path = project_id::text || '/' || id::text)
);

create index project_documents_project_created_idx
  on public.project_documents (project_id, created_at desc, id desc);

alter table public.project_documents enable row level security;
revoke all on public.project_documents from anon, authenticated;
grant select, insert on public.project_documents to authenticated;

create policy project_documents_select_authorized
  on public.project_documents for select to authenticated
  using (private.can_access_project(project_id));

create policy project_documents_insert_manager
  on public.project_documents for insert to authenticated
  with check (
    private.can_manage_projects()
    and uploaded_by = (select auth.uid())
    and private.can_access_project(project_id)
    and exists (
      select 1 from public.projects project
      where project.id = project_id and project.archived_at is null
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-project-documents',
  'erp-project-documents',
  false,
  10485760,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/plain'
  ]
)
on conflict (id) do nothing;

create policy project_documents_storage_select_authorized
  on storage.objects for select to authenticated
  using (
    bucket_id = 'erp-project-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.can_access_project(split_part(name, '/', 1)::uuid)
  );

create policy project_documents_storage_insert_manager
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'erp-project-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.can_manage_projects()
    and exists (
      select 1 from public.projects project
      where project.id = split_part(name, '/', 1)::uuid
        and project.archived_at is null
    )
  );

create policy project_documents_storage_delete_manager
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-project-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.can_manage_projects()
  );
