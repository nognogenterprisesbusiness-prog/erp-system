import { execFileSync, execFile } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const container = "supabase_db_nognog-enterprises";
const run = promisify(execFile);
export async function withLocalFixture(test) {
  const endpoint = execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8", timeout: 15000 }).trim();
  if (!endpoint.startsWith("npipe://") && !endpoint.startsWith("unix://")) throw new Error("Integration tests require a local Docker socket, not a remote Docker host.");
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("npipe://") && !process.env.DOCKER_HOST.startsWith("unix://")) throw new Error("Remote DOCKER_HOST is not permitted.");
  for (const value of [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean)) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)) throw new Error("Integration tests refuse remote Supabase URLs.");
  }
  const database = `erp_test_${randomUUID().replaceAll("-", "")}`;
  if (!/^erp_test_[0-9a-f]{32}$/.test(database)) throw new Error("Invalid isolated database name.");
  // Copy into a disposable database: commands never mutate the original local database.
  execFileSync("docker", ["inspect", container], { stdio: "pipe", timeout: 15000 });
  const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--no-owner"], { maxBuffer: 128 * 1024 * 1024, timeout: 60000 });
  execFileSync("docker", ["exec", container, "createdb", "-U", "postgres", database], { timeout: 15000 });
  const sql = async (statement) => {
    const child = execFile("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], { maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
    child.stdin.end(statement);
    return await new Promise((resolve, reject) => { let output="", error=""; child.stdout.on("data", (d) => output+=d); child.stderr.on("data", (d) => error+=d); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error))); });
  };
  try {
    await sql(dump);
    const users = Object.fromEntries(["admin", "engineer", "foreman", "warehouse_staff"].map((role) => [role, randomUUID()]));
    const seeded = { admin: "10000000-0000-0000-0000-000000000001", engineer: "10000000-0000-0000-0000-000000000003", foreman: "10000000-0000-0000-0000-000000000004", warehouse_staff: "10000000-0000-0000-0000-000000000005" };
    for (const [role, id] of Object.entries(users)) {
      const password = randomBytes(32).toString("hex");
      await sql(`insert into auth.users(id,email,encrypted_password,raw_user_meta_data,created_at,updated_at) values('${id}','${id}@integration.local',extensions.crypt('${password}',extensions.gen_salt('bf')),'{"full_name":"Integration ${role}"}',now(),now());
        update public.profiles set onboarding_required=false where id='${id}';
        insert into public.user_roles(user_id,role,granted_by) values('${id}','${role}','${users.admin}');`);
      if (role !== "admin") await sql(`insert into public.project_assignments(project_id,user_id,assignment_role,assigned_on,assigned_by) select project_id,'${id}',assignment_role,assigned_on,'${users.admin}' from public.project_assignments where user_id='${seeded[role]}' and status='active';`);
      if (role === "warehouse_staff") await sql(`insert into public.warehouse_assignments(warehouse_id,user_id,assigned_on,assigned_by) select warehouse_id,'${id}',assigned_on,'${users.admin}' from public.warehouse_assignments where user_id='${seeded[role]}' and status='active';`);
    }
    const as = (role, statement) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${users[role]}',true); ${statement}; commit;`);
    const result = (output) => output.split("\n").filter((line) => /^[0-9a-f-]{36}$/.test(line)).at(-1);
    await test({ sql, as, users, result });
  } finally {
    // The exact generated test database is disposable; production/local company data is untouched.
    await run("docker", ["exec", container, "dropdb", "-U", "postgres", "--force", database], { timeout: 15000 });
  }
}
