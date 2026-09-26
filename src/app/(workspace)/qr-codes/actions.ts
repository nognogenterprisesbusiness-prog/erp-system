"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type QrActionState = { error: string };
const qrEntity = z.object({
  entityType: z.enum(["material", "equipment", "vehicle", "warehouse", "project_site"]),
  entityId: uuidSchema,
});
const change = z.object({ id: uuidSchema, reason: z.string().trim().min(2).max(500), operation: z.enum(["deactivate", "replace"]) });

export async function generateQrAction(_state: QrActionState, formData: FormData): Promise<QrActionState> {
  if (!(await requireUser()).canManage) return { error: "You do not have permission to manage QR codes." };
  const parsed = qrEntity.safeParse({ entityType: formData.get("entityType"), entityId: formData.get("entityId") });
  if (!parsed.success) return { error: "Select a valid record to generate its QR code." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_qr_code", { p_entity_type: parsed.data.entityType, p_entity_id: parsed.data.entityId });
  if (error || !data) return { error: error?.message ?? "Could not generate QR code." };
  redirect(`/qr-codes/${data}`);
}

export async function changeQrAction(_state: QrActionState, formData: FormData): Promise<QrActionState> {
  if (!(await requireUser()).canManage) return { error: "You do not have permission to manage QR codes." };
  const parsed = change.safeParse({ id: formData.get("id"), reason: formData.get("reason"), operation: formData.get("operation") });
  if (!parsed.success) return { error: "Enter a reason between 2 and 500 characters." };
  const { id, reason, operation } = parsed.data;
  const supabase = await createClient();
  if (operation === "replace") {
    const { data, error } = await supabase.rpc("replace_qr_code", { p_qr_id: id, p_reason: reason });
    if (error || !data) return { error: error?.message ?? "Could not replace QR code." };
    redirect(`/qr-codes/${data}`);
  }
  const { error } = await supabase.rpc("deactivate_qr_code", { p_qr_id: id, p_reason: reason });
  if (error) return { error: error.message };
  redirect(`/qr-codes/${id}`);
}
