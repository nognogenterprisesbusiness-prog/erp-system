-- A separate finance account may issue invoices and record client payments.
-- Existing Admin accounts retain all current finance permissions.
alter type public.app_role add value if not exists 'finance';
