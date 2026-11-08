"use server";

import { uuidSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type IdCardActionState = { ok?: boolean; message: string };

const replaceSchema = z.object({ employeeId: uuidSchema, reason: z.string().trim().min(3).max(500) });

/** Retires the worker's current ID card (lost, damaged) and issues a new code. The old card stops scanning. */
export async function replaceIdCardAction(_: IdCardActionState, form: FormData): Promise<IdCardActionState> {
  try { await requireManager(); } catch { return { ok: false, message: "Only Admin can replace ID cards." }; }
  const parsed = replaceSchema.safeParse({ employeeId: form.get("employeeId"), reason: form.get("reason") });
  if (!parsed.success) return { ok: false, message: "Enter a reason of at least 3 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_employee_id_card", { p_employee_id: parsed.data.employeeId, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: error.code === "42501" ? "Only Admin can replace ID cards." : "The card could not be replaced. Refresh and try again." };
  revalidatePath(`/employees/${parsed.data.employeeId}`);
  return { ok: true, message: "New card issued. Print it; the old card no longer scans." };
}
