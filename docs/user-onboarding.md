# Web user onboarding and account access

This is the invite-first account workflow. An Admin can invite an Engineer, Foreman or Warehouse Staff member. The invitee chooses a password (minimum 12 characters) at `/auth/accept-invite`; there is no plaintext temporary password. Administrators can disable/reactivate eligible accounts but cannot disable themselves or create/manage a peer Admin. Project/site/warehouse assignments remain separate from the application role.

## Configuration before live use

- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the **server-only** `SUPABASE_SECRET_KEY`. These standard names are used in every environment; there is no staging mode or preview switcher. See [Supabase configuration](./supabase-setup.md).
- Set `APP_SITE_URL` to the exact HTTPS deployment origin (HTTP is accepted only for localhost/127.0.0.1). Allow `${APP_SITE_URL}/auth/accept-invite` and `${APP_SITE_URL}/auth/reset-password` in the selected Supabase Auth redirect allow list. Configure a working invite/recovery email provider and template, then test both links in that environment.
- Disable general user signup in the selected Auth project while keeping the email provider enabled. The local `supabase/config.toml` sets global `auth.enable_signup=false`; the hosted project must be checked independently. Review Auth rate limits and SMTP before client use.
- Apply all migrations in order, then seed only a disposable local database. The committed `supabase/seed.sql` contains local fixture accounts; it must not be loaded into staging or production.

## Failure and access behavior

The admin invitation call creates the Auth identity, then a single database command marks its profile inactive/needing password setup and assigns the initial role. Successful password setup enables the profile. If the post-invite command fails, the person remains role-less and unable to enter the ERP; the Users page exposes a role-recovery action. The invitation email itself cannot be rolled back. Users can request a recovery link without revealing whether the address exists. Profile deactivation is enforced in the database role checks and cannot be reversed by self-updating the profile.

All accounts use real Supabase Auth sessions and database authorization. There is no separate local-demo user system or credential-free role switcher.

## Verification gate

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:auth`. Before live release, run database tests for self-update restrictions, role-less catalog denial, initial-role grants, and status changes. In a disposable test database, verify invite/email links, password setup/reset, expired links, lost-role recovery, deactivation/reactivation, peer-admin denial, and direct Data API attempts to change protected fields or other users' data. These database checks have not been completed in this workspace.
