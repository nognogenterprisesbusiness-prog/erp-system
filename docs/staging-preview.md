# Connected staging preview

The browser-only IndexedDB demo has been retired. The same Next.js routes, Supabase Auth, database policies and server actions used by production now serve the preview. There is **no anonymous login** and no client-side role override.

## Set up an isolated project

1. Create a disposable Supabase staging project with its own URL, publishable key and server-only secret. Never use production credentials or copy production records into the seed. Set `APP_MODE=staging` and `NEXT_PUBLIC_APP_MODE=staging`; use the staging Supabase variables in `.env.example`.
2. Apply every ordered migration to this isolated project and inspect the results. Load `supabase/seed.sql` into an empty staging schema only after migrations succeed. Its four fixture accounts start with random, unusable passwords. The seed's normal project, role and inventory writes generate genuine sample audit entries through database triggers; it does not forge audit rows.
3. Configure server-only `STAGING_PREVIEW_ACCOUNTS` with **all four** seed emails (`admin`, `engineer`, `foreman`, `warehouse` at `@nognog.local`), distinct strong passwords and readable labels. Set `STAGING_PREVIEW_EXPECTED_URL` to the exact staging Supabase URL. Run `npm run staging:provision-preview` once to verify the four seeded account IDs/emails and set those passwords. No password is printed. Do not commit this environment file.
4. Set `STAGING_PREVIEW_ENABLED=true`, restart the web server, and sign in once with one staging fixture account. The profile menu can then switch among configured accounts without re-entering credentials. The switch is a server-side Supabase sign-in, so each role receives a real session and the database's normal RLS applies. Turn the flag off to remove the switcher without changing production code.
5. Perform role-by-role workflow, RLS denial, concurrency, export, photo, notification, inventory valuation and audit tests before using staging as acceptance evidence. A seed and successful build alone do not validate those workflows.

`APP_MODE=local-demo` is retained only as a local setup-required state while `.env.local` is being migrated. It redirects all app paths, including the former `/demo`, to `/setup` and does not start a browser data store. Production mode never exposes `/setup` or the account switcher.

There is no staging Supabase project connected in this checkout, so migrations, seed, provisioning and authenticated preview remain **unapplied and unverified**.

The four-role consolidation changed the initial enum definitions and permission checks in the ordered baseline migrations. Apply this sequence only to a **new, empty** staging database. If another database has already applied earlier versions, do not replay edited files against it; first inspect its migration history and create a reviewed forward data/schema migration for existing users and assignments.
