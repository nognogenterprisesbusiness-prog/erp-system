import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Requires a local PostgreSQL runtime, never accepts a remote connection URL.
// It applies the full ERP migration chain and fictional seed into a new database.
export async function withIsolatedPostgres(test) {
  const bin = process.env.ERP_TEST_PG_BIN;
  if (!bin || !fs.existsSync(path.join(bin, process.platform === "win32" ? "psql.exe" : "psql")))
    throw new Error("Set ERP_TEST_PG_BIN to a local PostgreSQL bin directory. This test never uses hosted credentials.");
  const port = process.env.ERP_TEST_PG_PORT ?? "55439";
  if (!/^\d{4,5}$/.test(port)) throw new Error("Invalid local test port.");
  const pgEnv = { ...process.env };
  for (const name of Object.keys(pgEnv)) if (name.startsWith("PG")) delete pgEnv[name];
  const database = `erp_test_${randomUUID().replaceAll("-", "")}`;
  const sql = (statement, db = database) => new Promise((resolve, reject) => {
    const child = execFile(path.join(bin, "psql"), ["-X", "-h", "127.0.0.1", "-p", port, "-U", "erp_test_admin", "-d", db, "-v", "ON_ERROR_STOP=1", "-Atq"],
      { timeout: 60000, maxBuffer: 16 * 1024 * 1024, env: pgEnv },
      (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim()));
    child.stdin.end(statement);
  });
  await sql(`create database ${database}`, "postgres");
  try {
    await sql(`alter database ${database} set timezone='UTC'`, "postgres");
    // Roles are cluster-wide. Create them once without touching existing roles.
    let bootstrap = fs.readFileSync(new URL("./erp-postgres-bootstrap.sql", import.meta.url), "utf8");
    bootstrap = bootstrap.replace(/create role (\w+)( bypassrls)?;/g, (_, role, bypass = "") =>
      `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${bypass}; end if; end $$;`);
    await sql(bootstrap);
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const name of fs.readdirSync(migrations).filter((n) => n.endsWith(".sql")).sort()) {
      let migration = fs.readFileSync(new URL(name, migrations), "utf8");
      // pg_cron is unavailable in the portable distribution. Only its initial
      // extension/job registration is skipped; no ERP function or policy changes.
      if (name === "20260923130000_phase10a_notifications.sql") {
        migration = migration.replace("create extension if not exists pg_cron with schema pg_catalog;", "")
          .replace("select cron.schedule('nognog-notification-outbox', '* * * * *', 'select private.process_notification_outbox(100)');", "");
      }
      migration = migration.replace(/^select cron\.schedule\([^;]+;\r?\n/gm, "");
      if (!/^begin;/im.test(migration)) migration = `begin;\n${migration}\ncommit;`;
      try { await sql(migration); } catch (error) { throw new Error(`Migration ${name}: ${error.message}`); }
    }
    await sql(fs.readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"));
    const users = { admin: "10000000-0000-0000-0000-000000000001", engineer: "10000000-0000-0000-0000-000000000003", foreman: "10000000-0000-0000-0000-000000000004", warehouse_staff: "10000000-0000-0000-0000-000000000005", finance: randomUUID() };
    await sql(`insert into auth.users(id,email,raw_user_meta_data) values('${users.finance}','finance@erp-test.local','{"full_name":"Test Finance"}');
      insert into public.user_roles(user_id,role) values('${users.finance}','finance');
      update public.profiles set onboarding_required=false where id in (${Object.values(users).map((id) => `'${id}'`).join(",")});`);
    const as = (role, statement) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${users[role]}',true); ${statement}; commit;`);
    const result = (output) => output.split("\n").filter((line) => /^[0-9a-f-]{36}$/.test(line)).at(-1);
    const scalar = (output) => output.split("\n").at(-1);
    await test({ sql, as, users, result, scalar });
  } finally {
    // Exact generated database name; only this fixture is removed.
    await sql(`drop database ${database} with (force)`, "postgres");
  }
}
