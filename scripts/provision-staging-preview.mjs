import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const fixtureUsers = [
  ["10000000-0000-0000-0000-000000000001", "admin@nognog.local"],
  ["10000000-0000-0000-0000-000000000003", "engineer@nognog.local"],
  ["10000000-0000-0000-0000-000000000004", "foreman@nognog.local"],
  ["10000000-0000-0000-0000-000000000005", "warehouse@nognog.local"],
];

async function main() {
  if (process.env.APP_MODE !== "staging" || process.env.NEXT_PUBLIC_APP_MODE !== "staging") {
    throw new Error("Preview accounts can only be provisioned with both app modes set to staging.");
  }
  const url = process.env.NEXT_PUBLIC_STAGING_SUPABASE_URL;
  const expectedUrl = process.env.STAGING_PREVIEW_EXPECTED_URL;
  const secret = process.env.STAGING_SUPABASE_SECRET_KEY;
  if (!url || !expectedUrl || url !== expectedUrl || !secret || url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Set an isolated staging URL, matching STAGING_PREVIEW_EXPECTED_URL, and its server-only secret.");
  }
  let accounts;
  try { accounts = JSON.parse(process.env.STAGING_PREVIEW_ACCOUNTS ?? "null"); }
  catch { throw new Error("STAGING_PREVIEW_ACCOUNTS must be valid JSON."); }
  if (!Array.isArray(accounts) || accounts.length !== fixtureUsers.length) {
    throw new Error("Configure all four seeded preview accounts before provisioning.");
  }
  const configured = new Map(accounts.map((account) => [account?.email?.toLowerCase(), account]));
  if (configured.size !== fixtureUsers.length || fixtureUsers.some(([, email]) => {
    const account = configured.get(email);
    return !account || typeof account.password !== "string" || account.password.length < 12;
  })) throw new Error("Preview accounts must match the four seed emails and use unique passwords of at least 12 characters.");
  if (new Set(accounts.map((account) => account.password)).size !== fixtureUsers.length) {
    throw new Error("Use a distinct password for each preview account.");
  }

  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const [id, email] of fixtureUsers) {
    const { data, error } = await client.auth.admin.getUserById(id);
    if (error || data.user?.email?.toLowerCase() !== email) {
      throw new Error(`Staging seed account ${email} is missing or mismatched. No passwords were changed.`);
    }
  }
  for (const [id, email] of fixtureUsers) {
    const { error } = await client.auth.admin.updateUserById(id, { password: configured.get(email).password });
    if (error) throw new Error(`Could not provision ${email}; resolve the error and rerun this idempotent command.`);
  }
  process.stdout.write("Four isolated staging preview accounts are ready. No passwords were printed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
