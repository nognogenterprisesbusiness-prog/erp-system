import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const files = readdirSync(fileURLToPath(new URL("../supabase/migrations/", import.meta.url)));
const versions = new Map();
for (const file of files.filter((name) => name.endsWith(".sql"))) {
  const version = file.match(/^(\d{14})_/)?.[1];
  if (!version) throw new Error(`Invalid migration filename: ${file}`);
  if (versions.has(version)) throw new Error(`Duplicate migration version: ${versions.get(version)} and ${file}`);
  versions.set(version, file);
}
console.log(`Verified ${versions.size} unique migration versions.`);
