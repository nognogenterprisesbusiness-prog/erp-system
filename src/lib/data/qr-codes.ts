import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import type { QrCodeRow, QrEntityType, QrResolution } from "@/types/database";

const qrResolutionSchema: z.ZodType<QrResolution> = z.object({
  qr_id: uuidSchema, identifier: z.string().regex(/^NQ-[A-F0-9]{32}$/),
  entity_type: z.enum(["material", "equipment", "vehicle", "warehouse", "project_site"]),
  entity_id: uuidSchema, name: z.string().min(1), code: z.string().nullable(), project_id: uuidSchema.nullable(),
});

export const qrEntityLabels: Record<QrEntityType, string> = {
  material: "Material", equipment: "Equipment", vehicle: "Vehicle", warehouse: "Warehouse", project_site: "Project site",
};

export function qrEntityHref(code: Pick<QrResolution, "entity_type" | "entity_id" | "project_id">) {
  switch (code.entity_type) {
    case "material": return `/materials/${code.entity_id}`;
    case "equipment": return `/equipment/${code.entity_id}`;
    case "vehicle": return `/vehicles/${code.entity_id}`;
    case "warehouse": return `/warehouses/${code.entity_id}`;
    case "project_site": return code.project_id ? `/projects/${code.project_id}` : "/projects";
  }
}

export async function getActiveQrCode(entityType: QrEntityType, entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("qr_codes").select("*").eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "active").maybeSingle();
  if (error) throw new Error("Unable to load QR code.");
  return data;
}

export async function getActiveQrCodesForEntities(entityType: QrEntityType, entityIds: string[]) {
  if (entityIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("qr_codes").select("*").eq("entity_type", entityType).eq("status", "active").in("entity_id", entityIds);
  if (error) throw new Error("Unable to load QR codes.");
  return data ?? [];
}

export async function getQrCode(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("qr_codes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load QR code.");
  if (!data) notFound();
  return data;
}

export async function getQrEvents(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("qr_events").select("*").eq("qr_code_id", id).order("occurred_at", { ascending: false });
  if (error) throw new Error("Unable to load QR history.");
  return data ?? [];
}

export async function getQrReplacement(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("qr_codes").select("id,public_identifier").eq("replaces_qr_id", id).maybeSingle();
  if (error) throw new Error("Unable to load QR replacement.");
  return data;
}

export async function listQrCodes(page: number, entityType?: QrEntityType, search = "", batchSize = 25) {
  const supabase = await createClient();
  const pageSize = Math.min(500, Math.max(1, Number.isSafeInteger(batchSize) ? batchSize : 25));
  const safePage = Math.min(10000, Math.max(1, Number.isSafeInteger(page) ? page : 1));
  let query = supabase.from("qr_codes").select("*", { count: "exact" }).order("generated_at", { ascending: false }).order("id").range((safePage - 1) * pageSize, safePage * pageSize - 1);
  if (entityType) query = query.eq("entity_type", entityType);
  const term = safeSearchTerm(search);
  if (term) query = query.ilike("public_identifier", `%${term}%`);
  const { data, count, error } = await query;
  if (error) throw new Error("Unable to load QR registry.");
  return { codes: data ?? [], count: count ?? 0, pageSize };
}

export async function resolveQrCode(identifier: string): Promise<QrResolution> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_qr_code", { p_identifier: identifier });
  if (error) throw new Error("QR code is unavailable or you do not have access.");
  const parsed = qrResolutionSchema.safeParse(data);
  if (!parsed.success) throw new Error("QR code is unavailable or you do not have access.");
  return parsed.data;
}

export function qrCodeImagePath(code: QrCodeRow, format: "png" | "svg") {
  return `/qr-codes/${code.id}/image?format=${format}`;
}

export async function getQrAssociatedRecord(code: QrCodeRow) {
  const supabase = await createClient();
  if (code.entity_type === "material") {
    const { data, error } = await supabase.from("materials").select("name,code").eq("id", code.entity_id).single();
    if (error) throw new Error("Unable to load associated material.");
    return { name: data.name, code: data.code, href: `/materials/${code.entity_id}` };
  }
  if (code.entity_type === "equipment" || code.entity_type === "vehicle") {
    const { data, error } = await supabase.from("assets").select("name,code").eq("id", code.entity_id).single();
    if (error) throw new Error("Unable to load associated asset.");
    return { name: data.name, code: data.code, href: `/${code.entity_type === "vehicle" ? "vehicles" : "equipment"}/${code.entity_id}` };
  }
  if (code.entity_type === "warehouse") {
    const { data, error } = await supabase.from("warehouses").select("name,code").eq("id", code.entity_id).single();
    if (error) throw new Error("Unable to load associated warehouse.");
    return { name: data.name, code: data.code, href: `/warehouses/${code.entity_id}` };
  }
  const { data, error } = await supabase.from("project_sites").select("name,project_id").eq("id", code.entity_id).single();
  if (error) throw new Error("Unable to load associated site.");
  return { name: data.name, code: null, href: `/projects/${data.project_id}` };
}
