-- Admin can rename, re-type and delete project documents. Engineers and
-- Foremen keep read and download access to their assigned projects. Every
-- upload, edit and delete is written to the audit log.
--
-- Safe to rerun: policies and the trigger are dropped before being created.

grant update (file_name, category), delete on public.project_documents to authenticated;

drop policy if exists project_documents_update_manager on public.project_documents;
create policy project_documents_update_manager
  on public.project_documents for update to authenticated
  using (private.can_manage_projects() and private.can_access_project(project_id))
  with check (private.can_manage_projects() and private.can_access_project(project_id));

drop policy if exists project_documents_delete_manager on public.project_documents;
create policy project_documents_delete_manager
  on public.project_documents for delete to authenticated
  using (private.can_manage_projects() and private.can_access_project(project_id));

drop trigger if exists project_documents_audit on public.project_documents;
create trigger project_documents_audit
after insert or update or delete on public.project_documents
for each row execute function private.audit_row_change();
