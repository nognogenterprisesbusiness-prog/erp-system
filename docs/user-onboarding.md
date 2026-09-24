# Web user onboarding and account access

This is the invite-first Phase 1 account workflow. A manager can invite a new person with an initial non-privileged role; Owner/Super Admin may also invite an Admin. The invitee chooses a password (minimum 12 characters) at `/auth/accept-invite`. There is no plaintext temporary password. Authenticated people can edit only their own name and phone. Administrators can disable/reactivate eligible accounts; they cannot disable themselves or Owner/Super Admin accounts. An Admin cannot disable or create a peer Admin. Project/site/warehouse assignments remain separate from the application role.

## Configuration before live use

- Select `APP_MODE=staging` or `production` with matching public Supabase URL/publishable key. Set the corresponding **server-only** `STAGING_SUPABASE_SECRET_KEY` or `SUPABASE_SECRET_KEY`; never use a `NEXT_PUBLIC_` prefix for this key. The application refuses a missing key and never falls back to another mode.
- Set `APP_SITE_URL` to the exact HTTPS deployment origin (HTTP is accepted only for localhost/127.0.0.1). Allow `${APP_SITE_URL}/auth/accept-invite` and `${APP_SITE_URL}/auth/reset-password` in the selected Supabase Auth redirect allow list. Configure a working invite/recovery email provider and template, then test both links in that environment.
- Disable general user signup in the selected Auth project while keeping the email provider enabled. The local `supabase/config.toml` sets global `auth.enable_signup=false`; the hosted project must be checked independently. Review Auth rate limits and SMTP before client use.
- Apply all migrations in order, then seed only a disposable local database. The committed `supabase/seed.sql` contains local fixture accounts; it must not be loaded into staging or production.

## Failure and access behavior

The admin invitation call creates the Auth identity, then a single database command marks its profile inactive/needing password setup and assigns the initial role. Successful password setup enables the profile. If the post-invite command fails, the person remains role-less and unable to enter the ERP; the Users page exposes a role-recovery action. The invitation email itself cannot be rolled back. Users can request a recovery link without revealing whether the address exists. Profile deactivation is enforced in the database role checks and cannot be reversed by self-updating the profile.

Local Demo has a separate Users preview for fictional personas. Adding a persona does not send email or create a live Auth account; the role picker only demonstrates navigation. Demo role switching is not an authorization test.

## Verification gate

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:auth`, and `npm run test:demo`. The SQL regression fixtures were removed for demo-focused development; recreate and run database tests for self-update restrictions, role-less catalog denial, initial-role grants, and status changes before any live release. Complete a staging walkthrough: invite, email link, first password, wrong/expired link, password reset, lost-role recovery, deactivation while signed in, reactivation, peer-admin denial, and direct Data API attempts to change `is_active`, `onboarding_required`, and other users' data. These live checks have not been completed in this workspace because local PostgreSQL/Supabase is unavailable.
