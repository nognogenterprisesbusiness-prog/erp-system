-- Supports the manager audit explorer's newest-first pagination.
create index if not exists audit_logs_created_at_id_desc_idx
  on public.audit_logs (created_at desc, id desc);
