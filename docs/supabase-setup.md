# Supabase configuration

The connected web ERP uses the same four environment-variable names locally and in a deployment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `APP_SITE_URL`. Copy `.env.example` to `.env.local` and provide values for the Supabase project you intend to use. `SUPABASE_SECRET_KEY` is server-only; never prefix it with `NEXT_PUBLIC_` or commit real credentials.

`APP_SITE_URL` is the application origin used for invitations and password recovery. Use HTTPS outside localhost. Configure the corresponding invite and recovery redirect URLs in Supabase Auth. Sign in through normal Supabase Auth; there is no preview account switcher or bypass login.

The same configuration names can be set to a separate disposable project when testing. No staging-specific environment variables or app mode are required. The committed `supabase/seed.sql` contains fictional four-role data and must only be loaded into an empty disposable database, never a company or production database.

Applying the ordered migrations and testing database permissions, inventory accounting, and real-role workflows before production use remains necessary. A successful web build does not prove those behaviors.
