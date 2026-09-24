alter table public.profiles add column onboarding_required boolean not null default false;

-- Only the guarded server invitation/password flow may change this column.
