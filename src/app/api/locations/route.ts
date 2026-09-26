import { safeSearchTerm } from "@/lib/data/search";
import { createClient } from "@/lib/supabase/server";

const codePattern = /^\d{10}$/;
const locationKinds = ["regions", "provinces", "municipalities", "barangays"] as const;
type LocationKind = (typeof locationKinds)[number];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "municipalities";
  if (!locationKinds.includes(kind as LocationKind)) return Response.json({ error: "Invalid location type." }, { status: 400 });
  const page = Math.min(1000, Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") ?? "20", 10) || 20));
  const query = safeSearchTerm(params.get("q") ?? "").toLocaleLowerCase();
  const parent = params.get("parent") ?? "";
  if (parent && !codePattern.test(parent)) return Response.json({ error: "Invalid parent code." }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return Response.json({ error: "Sign in to search locations." }, { status: 401 });
  const start = (page - 1) * pageSize;
  if (kind === "municipalities") {
    let lookup = supabase.from("geo_municipalities").select("code,name,display_name,province_code,province_name,region_code,region_name,kind,zip_code,district,selectable", { count: "exact" }).eq("selectable", true).order("display_name").range(start, start + pageSize - 1);
    if (parent) lookup = lookup.eq("province_code", parent);
    if (query) lookup = lookup.or(`display_name.ilike.%${query}%,name.ilike.%${query}%`);
    const { data, count, error } = await lookup;
    if (error) return Response.json({ error: "Location search is unavailable." }, { status: 503 });
    return Response.json({ items: (data ?? []).map((row) => ({ code: row.code.trim(), name: row.name, displayName: row.display_name, provinceCode: row.province_code?.trim() ?? null, province: row.province_name, regionCode: row.region_code.trim(), region: row.region_name, type: row.kind, zipCode: row.zip_code, district: row.district, selectable: row.selectable })), page, pageSize, total: count ?? 0 });
  }
  if (kind === "regions") {
    let lookup = supabase.from("geo_regions").select("code,name", { count: "exact" }).order("name").range(start, start + pageSize - 1);
    if (query) lookup = lookup.ilike("name", `%${query}%`);
    const { data, count, error } = await lookup;
    if (error) return Response.json({ error: "Location search is unavailable." }, { status: 503 });
    return Response.json({ items: (data ?? []).map((row) => ({ code: row.code.trim(), name: row.name })), page, pageSize, total: count ?? 0 });
  }
  if (kind === "provinces") {
    let lookup = supabase.from("geo_provinces").select("code,name,region_code", { count: "exact" }).order("name").range(start, start + pageSize - 1);
    if (parent) lookup = lookup.eq("region_code", parent);
    if (query) lookup = lookup.ilike("name", `%${query}%`);
    const { data, count, error } = await lookup;
    if (error) return Response.json({ error: "Location search is unavailable." }, { status: 503 });
    return Response.json({ items: (data ?? []).map((row) => ({ code: row.code.trim(), name: row.name, regionCode: row.region_code.trim() })), page, pageSize, total: count ?? 0 });
  }
  let lookup = supabase.from("geo_barangays").select("code,name,municipality_code", { count: "exact" }).order("name").range(start, start + pageSize - 1);
  if (parent) lookup = lookup.eq("municipality_code", parent);
  if (query) lookup = lookup.ilike("name", `%${query}%`);
  const { data, count, error } = await lookup;
  if (error) return Response.json({ error: "Location search is unavailable." }, { status: 503 });
  return Response.json({ items: (data ?? []).map((row) => ({ code: row.code.trim(), name: row.name, municipalityCode: row.municipality_code.trim() })), page, pageSize, total: count ?? 0 });
}
