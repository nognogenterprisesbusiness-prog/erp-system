# Supabase configuration

The connected web ERP uses the same four environment-variable names locally and in a deployment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `APP_SITE_URL`. Copy `.env.example` to `.env.local` and provide values for the Supabase project you intend to use. `SUPABASE_SECRET_KEY` is server-only; never prefix it with `NEXT_PUBLIC_` or commit real credentials.

`APP_SITE_URL` is the application origin used for invitations and password recovery. Use HTTPS outside localhost. Configure the corresponding invite and recovery redirect URLs in Supabase Auth. Sign in through normal Supabase Auth; there is no preview account switcher or bypass login.

The same configuration names can be set to a separate disposable project when testing. No staging-specific environment variables or app mode are required. The committed `supabase/seed.sql` contains fictional four-role data and must only be loaded into an empty disposable database, never a company or production database.

Run the seed as a complete script after all migrations. It uses a transaction to prevent partial fixture loads. Auth identities use a generated UUID `id` and a text `provider_id`; record UUIDs are internal keys, while codes such as `PRJ-024`, `WH-MAIN`, and `MAT-CEMENT` identify business records. The fixture accounts have random passwords, not shared login credentials; use the normal Auth administration flow to provision accounts for sign-in.

If an older seed failed after some statements had already committed, inspect the existing fixtures before retrying. Do not blindly rerun the full seed or delete existing records. For the identity type error alone, the corrected `auth.identities` insert can be run separately; it safely skips existing email identities.

For `record "new" has no field "archived_at"` from `private.create_initial_qr_trigger()`, apply `supabase/migrations/20260926100000_fix_qr_trigger_record_fields.sql` before retrying the failed operation. This repair replaces only the trigger function and preserves its restricted grants; it does not recreate tables, triggers, or existing QR labels. The table branch is selected before reading table-specific fields. An isolated PostgreSQL regression check reproduced the old error and verified mixed-table inserts, all five QR entity types, inactive/archived exclusions, and repeat application of the repair; full Supabase seed execution still needs verification.

Applying the ordered migrations and testing database permissions, inventory accounting, and real-role workflows before production use remains necessary. A successful web build does not prove those behaviors.
