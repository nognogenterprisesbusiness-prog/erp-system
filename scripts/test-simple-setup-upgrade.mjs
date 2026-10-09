import assert from "node:assert/strict";
import fs from "node:fs";
import { withIsolatedPostgres } from "./isolated-postgres-fixture.mjs";

const migrationName = "20261009140000_simple_supplier_and_vehicle_setup.sql";
await withIsolatedPostgres(async ({ sql, scalar, as }) => {
  const row = JSON.parse(scalar(await sql(`select row_to_json(v) from (
    select a.code,a.brand,a.model,a.category_id,a.acquisition_date,v.vehicle_type,v.plate_number,
      v.manufacture_year,v.current_mileage from public.assets a
      join public.vehicle_details v on v.asset_id=a.id where a.code='VEH-DT-001'
  ) v`)));
  assert.equal(row.vehicle_type, "Dump Truck");
  assert.equal(row.plate_number, "ABC 1234");
  assert.equal(row.brand, "Isuzu");
  assert.equal(row.model, "GIGA");
  assert.equal(row.acquisition_date, "2024-08-10");
  assert.equal(row.manufacture_year, 2024);
  assert.equal(row.current_mileage, 18450.5);
  assert.equal(row.category_id, "80000000-0000-0000-0000-000000000003");
  assert.equal(scalar(await sql("select count(*) from public.employee_categories")), "3");
  assert.equal(scalar(await as("admin", "select count(*) from public.assets where code='VEH-DT-001'")), "1");
  assert.equal(scalar(await sql("select count(*) from public.assets where asset_kind='equipment' and category_id is not null")), "1");
  assert.equal(scalar(await as("admin", "select count(*) from public.assets where asset_kind='equipment'")), "1");
  console.log("PASS: populated upgrade backfills vehicle types and retains legacy vehicle and employee data");
}, {
  seedAfterMigrations: false,
  beforeMigration: async ({ name, sql }) => {
    if (name !== migrationName) return;
    const seed = fs.readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
    // Insert the legacy vehicle through its pre-upgrade command signature.
    const legacySeed = seed.replace(/select public\.save_vehicle\([\s\S]*?\);/, `select public.save_vehicle(
      null,'VEH-DT-001','Dump Truck #001','Legacy vehicle',
      '80000000-0000-0000-0000-000000000003','Isuzu','GIGA','2024-08-10','company_owned','available',
      (select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id
        where il.warehouse_id='30000000-0000-0000-0000-000000000001'),
      'Roadworthy','ABC 1234',2024::smallint,18450.50);`);
    assert.notEqual(legacySeed, seed);
    await sql(legacySeed);
    const migration = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
    const original = migration.replace(/^set constraints public\.vehicle_details_match_asset (immediate|deferred);\r?\n/gm, "");
    assert.notEqual(original, migration);
    await assert.rejects(sql(original), /cannot ALTER TABLE "vehicle_details" because it has pending trigger events/);
    assert.equal((await sql("select to_regprocedure('public.save_supplier_category(uuid,text,text)') is not null")), "t");
    console.log("PASS: original pending-trigger failure reproduces and rolls back completely");
  },
});
