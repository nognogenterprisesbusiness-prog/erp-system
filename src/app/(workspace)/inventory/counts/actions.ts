"use server";

import { revalidatePath } from "next/cache";
import { stockCountDecisionSchema, stockCountInputSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type StockCountActionState = { message: string; ok?: boolean; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function recordStockCountAction(_: StockCountActionState, form: FormData): Promise<StockCountActionState> {
  const user = await requireUser();
  if (!user.canOperateInventory && !user.roles.some((role) => ["project_manager", "engineer", "foreman"].includes(role)))
    return { message: "You cannot count this stock location." };
  const parsed = stockCountInputSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), materialId: value(form, "materialId"),
    locationId: value(form, "locationId"), countedQuantity: value(form, "countedQuantity"),
    reasonType: value(form, "reasonType"), reason: value(form, "reason"),
  });
  if (!parsed.success) return { message: "Review the counted quantity and reason.", fieldErrors: parsed.error.flatten().fieldErrors };
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_inventory_stock_count", {
    p_key: input.idempotencyKey, p_material_id: input.materialId, p_location_id: input.locationId,
    p_counted: input.countedQuantity, p_reason_type: input.reasonType, p_reason: input.reason,
  });
  if (error) return { message: error.code === "42501" ? "You cannot count this location." : "The count could not be recorded. Confirm that opening quantity and value have been reconciled." };
  revalidatePath("/inventory/counts");
  return { message: "Stock count submitted for administrator review.", ok: true };
}

export async function decideStockCountAction(_: StockCountActionState, form: FormData): Promise<StockCountActionState> {
  const user = await requireUser();
  if (!user.canManage) return { message: "Only an administrator can decide stock counts." };
  const parsed = stockCountDecisionSchema.safeParse({
    countId: value(form, "countId"), decision: value(form, "decision"), note: value(form, "note"),
  });
  if (!parsed.success) return { message: "Review the decision.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_inventory_stock_count", {
    p_count_id: parsed.data.countId, p_approve: parsed.data.decision === "approve", p_note: parsed.data.note,
  });
  if (error) return { message: error.code === "55000" ? "Stock changed since the count. Record a fresh count." : error.message.includes("surplus") ? "A surplus needs a verified costed receipt; this count cannot be approved as a write-off." : error.message.includes("reserved") ? "Reserved stock cannot be written off." : "The count decision could not be posted." };
  revalidatePath("/inventory/counts");
  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  return { message: parsed.data.decision === "approve" ? "Count approved and any shortage posted to the stock ledger." : "Count rejected.", ok: true };
}
