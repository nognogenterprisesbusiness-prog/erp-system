"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { resolveQrCode, qrEntityHref } from "@/lib/data/qr-codes";
import { createClient } from "@/lib/supabase/server";
import type { QrResolution } from "@/types/database";

export type ScanAction = { label: string; href: string };
export type ScanResult = { ok: true; resolution: QrResolution; actions: ScanAction[] } | { ok: false; message: string };
const identifierSchema = z.string().trim().toUpperCase().regex(/^NQ-[A-F0-9]{32}$/);

export async function resolveScannedCode(rawIdentifier: string): Promise<ScanResult> {
  const user = await requireUser();
  const parsed = identifierSchema.safeParse(rawIdentifier);
  if (!parsed.success) return { ok: false, message: "Enter a valid NQ QR identifier." };

  let resolution: QrResolution;
  try {
    resolution = await resolveQrCode(parsed.data);
  } catch {
    return { ok: false, message: "This QR label is unavailable or you do not have access to it." };
  }

  const actions: ScanAction[] = [{ label: "Open record", href: qrEntityHref(resolution) }];
  const id = encodeURIComponent(resolution.entity_id);
  const canRequest = !user.canManage && user.roles.some((role) => ["engineer", "foreman"].includes(role));
  if (resolution.entity_type === "material") {
    if (canRequest) {
      actions.push({ label: "Request material", href: `/requests/new?material=${id}` });
    }
    if (user.canManage || canRequest) actions.push({ label: "Record site use", href: `/inventory/consume?material=${id}` });
    if (user.canManage) {
      actions.push({ label: "Stock in", href: `/inventory/stock-in?material=${id}` });
      actions.push({ label: "Stock out exception", href: `/inventory/stock-out?material=${id}` });
    }
    if (user.canOperateInventory) actions.push({ label: "Transfer stock", href: `/inventory/transfers?new=1&material=${id}` });
  } else if (resolution.entity_type === "equipment") {
    if (user.canManage || canRequest) actions.push({ label: "Equipment requests and returns", href: `/requests?type=equipment&asset=${id}` });
  } else if (resolution.entity_type === "warehouse") {
    const supabase = await createClient();
    const { data } = await supabase.from("inventory_locations").select("id").eq("warehouse_id", resolution.entity_id).maybeSingle();
    if (data) actions.push({ label: "View warehouse stock", href: `/inventory?location=${encodeURIComponent(data.id)}` });
  } else if (resolution.entity_type === "project_site") {
    const supabase = await createClient();
    const { data } = await supabase.from("inventory_locations").select("id").eq("project_site_id", resolution.entity_id).maybeSingle();
    if (data) actions.push({ label: "View site stock", href: `/inventory?location=${encodeURIComponent(data.id)}` });
  }
  return { ok: true, resolution, actions };
}
