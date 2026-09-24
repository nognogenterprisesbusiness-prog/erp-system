import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (name) => JSON.parse(readFileSync(resolve(root, `locations/${name}.md`), "utf8")).data;
const escapeSql = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const clean = (value) => value.includes("Ã") ? Buffer.from(value, "latin1").toString("utf8") : value;
const regionRows = read("regions");
const provinceRows = read("provinces");
const municipalityRows = read("municipalities");
const barangayRows = read("barangays");
const regions = new Map(regionRows.map((row) => [row.name.trim(), row.code]));
const provinces = new Map(provinceRows.map((row) => [`${row.region.trim()}|${row.name.trim()}`, row.code]));
const municipalityKey = (province, name) => `${province.trim()}|${name.trim()}`;
const municipalities = new Map(municipalityRows.map((row) => [municipalityKey(row.province, row.name), row.code]));
const cityLabel = (name) => clean(name.trim()).replace(/^City of (.+)$/i, "$1 City");
const requireCode = (code, label) => { if (!code) throw new Error(`Missing parent for ${label}`); return code; };

const catalog = {
  regions: regionRows.map((row) => ({ code: row.code, name: row.name.trim() })),
  provinces: provinceRows.map((row) => ({ code: row.code, name: row.name.trim(), regionCode: requireCode(regions.get(row.region.trim()), row.name) })),
  municipalities: municipalityRows.map((row) => ({
    code: row.code, name: clean(row.name.trim()), displayName: cityLabel(row.name),
    provinceCode: row.region === "National Capital Region (NCR)" ? null : requireCode(provinces.get(`${row.region.trim()}|${row.province.trim()}`), row.name),
    regionCode: requireCode(regions.get(row.region.trim()), row.name),
    province: row.region === "National Capital Region (NCR)" ? "Metro Manila" : row.province.trim(), region: row.region.trim(), type: row.type.trim(), selectable: row.type === "City" || row.type === "Mun",
    zipCode: row.zip_code.trim(), district: row.district.trim(),
  })),
  barangays: barangayRows.map((row) => ({
    code: row.code, name: clean(row.name.trim()),
    municipalityCode: requireCode(municipalities.get(municipalityKey(row.province, row.city_municipality)), row.name),
  })),
};
for (const [name, rows] of Object.entries(catalog)) {
  if (new Set(rows.map((row) => row.code)).size !== rows.length) throw new Error(`Duplicate ${name} code`);
}

const values = (table, columns, rows) => {
  const chunks = [];
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200);
    chunks.push(`insert into public.${table} (${columns.join(", ")}) values\n${batch.map((row) => `  (${columns.map((column) => escapeSql(row[column])).join(", ")})`).join(",\n")}\non conflict (code) do nothing;`);
  }
  return chunks.join("\n\n");
};

const migration = `-- Generated from locations/*.md by scripts/build-location-catalog.mjs.
-- The supplied barangay file contains only ${catalog.barangays.length} records; it is not a national barangay catalog.
-- NCR municipality rows incorrectly say Sarangani in the source; normalized to Metro Manila with no province parent.
-- Source SubMun rows are retained for reference but are not selectable as a city or municipality.
create table public.geo_regions (
  code char(10) primary key,
  name text not null unique
);
create table public.geo_provinces (
  code char(10) primary key,
  name text not null,
  region_code char(10) not null references public.geo_regions(code),
  unique (region_code, name)
);
create table public.geo_municipalities (
  code char(10) primary key,
  name text not null,
  display_name text not null,
  province_code char(10) references public.geo_provinces(code),
  region_code char(10) not null references public.geo_regions(code),
  province_name text not null,
  region_name text not null,
  kind text not null,
  selectable boolean not null,
  zip_code text not null,
  district text not null
);
create table public.geo_barangays (
  code char(10) primary key,
  name text not null,
  municipality_code char(10) not null references public.geo_municipalities(code)
);

create index geo_provinces_region_idx on public.geo_provinces(region_code);
create index geo_municipalities_province_idx on public.geo_municipalities(province_code);
create index geo_municipalities_name_idx on public.geo_municipalities(display_name);
create index geo_barangays_municipality_idx on public.geo_barangays(municipality_code);

alter table public.geo_regions enable row level security;
alter table public.geo_provinces enable row level security;
alter table public.geo_municipalities enable row level security;
alter table public.geo_barangays enable row level security;
revoke all on public.geo_regions, public.geo_provinces, public.geo_municipalities, public.geo_barangays from anon, authenticated;
grant select on public.geo_regions, public.geo_provinces, public.geo_municipalities, public.geo_barangays to authenticated;
create policy geo_regions_read on public.geo_regions for select to authenticated using (true);
create policy geo_provinces_read on public.geo_provinces for select to authenticated using (true);
create policy geo_municipalities_read on public.geo_municipalities for select to authenticated using (true);
create policy geo_barangays_read on public.geo_barangays for select to authenticated using (true);

alter table public.projects add column municipality_code char(10) references public.geo_municipalities(code);
alter table public.warehouses add column municipality_code char(10) references public.geo_municipalities(code);
create index projects_municipality_idx on public.projects(municipality_code) where archived_at is null;
create index warehouses_municipality_idx on public.warehouses(municipality_code);

${values("geo_regions", ["code", "name"], catalog.regions)}

${values("geo_provinces", ["code", "name", "region_code"], catalog.provinces.map((row) => ({ code: row.code, name: row.name, region_code: row.regionCode })))}

${values("geo_municipalities", ["code", "name", "display_name", "province_code", "region_code", "province_name", "region_name", "kind", "selectable", "zip_code", "district"], catalog.municipalities.map((row) => ({ code: row.code, name: row.name, display_name: row.displayName, province_code: row.provinceCode, region_code: row.regionCode, province_name: row.province, region_name: row.region, kind: row.type, selectable: row.selectable, zip_code: row.zipCode, district: row.district })))}

${values("geo_barangays", ["code", "name", "municipality_code"], catalog.barangays.map((row) => ({ code: row.code, name: row.name, municipality_code: row.municipalityCode })))}
`;

writeFileSync(resolve(root, "src/lib/locations/catalog.json"), `${JSON.stringify(catalog)}\n`);
writeFileSync(resolve(root, "supabase/migrations/20260924150000_philippine_locations.sql"), migration);
console.log(`Generated ${Object.entries(catalog).map(([name, rows]) => `${rows.length} ${name}`).join(", ")}`);
