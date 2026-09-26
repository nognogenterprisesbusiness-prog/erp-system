-- Extend the construction material base-unit picker. These are distinct base
-- units; no stock conversion or historical quantity rewrite is implied.
insert into public.units_of_measure (code, name, symbol, dimension, decimal_scale) values
  ('BOX', 'Box', 'box', 'count', 0),
  ('ROLL', 'Roll', 'roll', 'count', 0),
  ('SET', 'Set', 'set', 'count', 0),
  ('PAIL', 'Pail', 'pail', 'count', 0),
  ('G', 'Gram', 'g', 'mass', 4),
  ('TON', 'Metric Ton', 't', 'mass', 4),
  ('ML', 'Milliliter', 'mL', 'volume', 4),
  ('CM', 'Centimeter', 'cm', 'length', 4)
on conflict do nothing;

-- Restore the configured notification subscription without bypassing row security.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'recipient_id' and udt_name = 'uuid'
  ) then
    raise exception 'Notification schema is missing recipient_id uuid. Apply the ordered notification migrations before this repair.';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notifications' and c.relrowsecurity
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'notifications_select_own'
  ) then
    raise exception 'Notification row security is incomplete. Apply the ordered notification migrations before this repair.';
  end if;

  grant select on table public.notifications to authenticated;

  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is missing. Configure Realtime before applying this repair.';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;


