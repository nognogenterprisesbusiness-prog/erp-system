# Empty staging business data

Run `reset-business-data.sql` in the **staging project's Supabase SQL Editor**, as
`postgres`, with the complete file selected. It is manual maintenance, not a
deployment migration. Pause staging data entry while it runs.

The transaction clears projects/sites/assignments, warehouses, inventory and
stock histories, materials/categories, suppliers/prices/purchases, equipment and
vehicles, employees/rates/attendance, costs/billing/payments, daily reports,
progress, QR records, notifications and audit logs. Document numbers restart.
It does not seed replacement records.

Auth users, passwords, sessions, identities, profiles/preferences, user roles,
profile photos, units, geographical reference data, notification type definitions,
migrations, database functions, RLS policies and grants stay in place. Project and
warehouse memberships are removed because their projects/warehouses are removed;
assign users when creating new records.

No backup schema, copied business rows or sequence snapshot is created. The
deletion becomes permanent when the transaction commits. Errors abort the
transaction; unknown tables or foreign keys outside the reviewed set prevent
the reset. The final result reports emptied tables and preserved user counts.

After the SQL reset succeeds, remove business photos from `erp-record-photos`
through Supabase Storage or its server API. Do not delete rows from
`storage.objects` using SQL, and do not clear `erp-profile-photos`.

After the reset, refresh the web app and verify empty projects/inventory/finance
while the same four accounts can still sign in. Keep the database empty until
new records are created through the real application workflows; do not run
`supabase/seed.sql`, which also contains Auth fixtures and business sample data.
