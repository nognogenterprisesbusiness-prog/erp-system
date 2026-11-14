-- Commit the enum value before the access migration uses it.
alter type public.app_role add value if not exists 'hr';
