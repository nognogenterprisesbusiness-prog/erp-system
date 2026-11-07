import "server-only";
import { driverDashboardSchema, driverExpenseInput } from "@nognog/domain";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { prepareRecordPhoto } from "@/lib/media/record-photo";
import { assetExpenseReceiptBucket, storeAssetExpenseReceipt } from "@/lib/media/asset-expense-receipt";
import { boundedBody, databaseError, MobileError } from "./http";

type Client = SupabaseClient<Database>;
const pageSize = 20;

export async function readDriverDashboard(client: Client, actor: string, request: Request) {
  const page = z.coerce.number().int().min(1).max(1000).safeParse(new URL(request.url).searchParams.get("page") ?? 1);
  if (!page.success) throw new MobileError(400, "Invalid expense page.");
  const offset = (page.data - 1) * pageSize;
  const [assignment, history] = await Promise.all([
    client.rpc("get_my_truck").maybeSingle(),
    client.from("asset_expenses").select("id,category,amount,expense_date,notes,reversed_at,reversal_reason,receipt_path")
      .eq("submitted_by", actor).order("expense_date", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize),
  ]);
  if (assignment.error) databaseError(assignment.error);
  if (history.error) databaseError(history.error);
  return driverDashboardSchema.parse({
    truck: assignment.data,
    expenses: history.data.slice(0, pageSize),
    hasMore: history.data.length > pageSize && page.data < 1000,
  });
}

export async function readDriverReceipt(client: Client, actor: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw new MobileError(404, "Receipt not found.");
  const { data, error } = await client.from("asset_expenses").select("receipt_path").eq("id", id).eq("submitted_by", actor).maybeSingle();
  if (error || !data?.receipt_path) throw new MobileError(404, "Receipt not found.");
  const photo = await client.storage.from(assetExpenseReceiptBucket).download(data.receipt_path);
  if (photo.error || !photo.data) throw new MobileError(404, "Receipt not found.");
  return new Response(photo.data, { headers: {
    "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export async function submitDriverExpense(client: Client, actor: string, request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) throw new MobileError(415, "Send an expense form.");
  const bytes = await boundedBody(request, 3_200_000);
  let form: FormData;
  try {
    form = await new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes).buffer }).formData();
  } catch {
    throw new MobileError(400, "Invalid expense form.");
  }
  const parsed = driverExpenseInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new MobileError(422, "Review the expense amount, category and date.");
  const input = parsed.data;
  const prior = await client.from("asset_expenses").select("id").eq("submitted_by", actor).eq("request_id", input.requestId).maybeSingle();
  if (prior.error) databaseError(prior.error);
  if (!prior.data) {
    const assignment = await client.rpc("get_my_truck").maybeSingle();
    if (assignment.error) databaseError(assignment.error);
    if (assignment.data?.assignment_id !== input.assignmentId || assignment.data.asset_id !== input.assetId) {
      throw new MobileError(409, "Your truck assignment changed. Refresh and start a new expense.");
    }
  }
  let photo: Buffer | undefined;
  try {
    photo = await prepareRecordPhoto(form.get("receipt"));
  } catch {
    throw new MobileError(422, "Choose a valid receipt photo under 3 MB.");
  }
  if (photo) {
    try {
      await storeAssetExpenseReceipt(client, actor, input.requestId, photo);
    } catch {
      throw new MobileError(409, "The receipt could not be saved. Retry with the original photo.");
    }
  }
  const result = await client.rpc("post_asset_expense", {
    p_asset_id: input.assetId, p_request_id: input.requestId, p_category: input.category,
    p_amount: Number(input.amount), p_expense_date: input.expenseDate, p_notes: input.notes,
    p_assignment_id: input.assignmentId, p_has_receipt: !!photo,
  });
  if (result.error?.message === "Truck assignment changed")
    throw new MobileError(409, "Your truck assignment changed. Refresh and start a new expense.");
  if (result.error) databaseError(result.error);
  return { id: result.data };
}
