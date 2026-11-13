"use server";

import { assetExpenseInput } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ExpenseActionState = { message: string; success?: boolean };

function refreshAsset(id: string) {
  revalidatePath(`/equipment/${id}`);
  revalidatePath(`/vehicles/${id}`);
}

export async function addAssetExpense(_: ExpenseActionState, form: FormData): Promise<ExpenseActionState> {
  await requireManager();
  const input = assetExpenseInput.safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Enter a category, valid date, and positive amount with up to two decimal places." };
  const expense = input.data;
  const client = await createClient();
  const { error } = await client.rpc("post_asset_expense", {
    p_asset_id: expense.assetId, p_request_id: expense.requestId,
    p_category: expense.category, p_amount: Number(expense.amount),
    p_expense_date: expense.expenseDate, p_notes: expense.notes,
    p_assignment_id: null, p_has_receipt: false,
  });
  if (error) return { message: error.code === "22023" ? "Check the date and expense details." : "Could not save the expense. Refresh the asset and retry." };
  refreshAsset(expense.assetId);
  return { message: "Expense recorded.", success: true };
}

export async function reverseAssetExpense(_: ExpenseActionState, form: FormData): Promise<ExpenseActionState> {
  await requireManager();
  const input = z.object({ assetId: z.uuid(), expenseId: z.uuid(), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Enter a correction reason between 3 and 500 characters." };
  const { assetId, expenseId, reason } = input.data;
  const client = await createClient();
  const entry = await client.from("asset_expenses").select("id").eq("asset_id", assetId).eq("id", expenseId).maybeSingle();
  if (!entry.data || entry.error) return { message: "This expense is unavailable." };
  const { error } = await client.rpc("reverse_asset_expense", { p_expense_id: expenseId, p_reason: reason });
  if (error) return { message: "Could not reverse the expense. Refresh and check whether it was already reversed." };
  refreshAsset(assetId);
  return { message: "Expense reversed.", success: true };
}

export async function assignDriverTruck(_: ExpenseActionState, form: FormData): Promise<ExpenseActionState> {
  await requireManager();
  const input = z.object({ driverId: z.uuid(), assetId: z.union([z.uuid(), z.literal("")]) }).safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Choose a valid truck." };
  const client = await createClient();
  const { error } = await client.rpc("set_driver_truck", {
    p_driver_id: input.data.driverId,
    ...(input.data.assetId ? { p_asset_id: input.data.assetId } : {}),
  });
  if (error) return { message: "Could not save the assignment. Check that the account is a driver and the vehicle is active." };
  revalidatePath("/users");
  revalidatePath("/vehicles/[id]", "page");
  return { message: "Assignment saved.", success: true };
}

export async function searchAssignableTrucks(search: string): Promise<{ options: { id: string; label: string; secondary?: string }[]; message?: string }> {
  await requireManager();
  const parsed = z.string().trim().max(80).safeParse(search);
  if (!parsed.success) return { options: [], message: "Use a shorter truck name or code." };
  const term = parsed.data.normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "");
  const client = await createClient();
  let query = client.from("assets").select("id,code,name").eq("asset_kind", "vehicle").is("archived_at", null).neq("status", "retired").order("code").order("id").limit(50);
  if (term) query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return { options: [], message: "Could not load trucks. Try the search again." };
  return { options: data.map(truck => ({ id: truck.id, label: truck.name, secondary: truck.code })) };
}
