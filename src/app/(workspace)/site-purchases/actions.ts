"use server";

import { reimburseSitePurchaseSchema, rejectSitePurchaseSchema, submitSitePurchaseSchema, uuidSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinanceViewer, requireUser } from "@/lib/auth";
import { prepareRecordPhoto } from "@/lib/media/record-photo";
import { storeSitePurchaseReceipt } from "@/lib/media/site-purchase-receipt";
import { createClient } from "@/lib/supabase/server";

export type SitePurchaseActionState = { message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (message: string, fieldErrors?: Record<string, string[]>): SitePurchaseActionState => ({ message, fieldErrors });

function sitePurchaseError(error: { code?: string; message: string }) {
  if (error.message.includes("site_purchases_receipt_unique")) return "This receipt from this store was already submitted.";
  if (error.message.includes("Not the Engineer")) return "You are not the Engineer of this site.";
  if (error.code === "42501") return "You do not have permission for this site purchase.";
  if (error.message.includes("receipt photo")) return "Add a photo of the receipt.";
  if (error.message.includes("future")) return "The receipt date cannot be in the future.";
  if (error.message.includes("already in inventory")) return "Choose materials that are already in inventory. Report missing materials to Admin.";
  if (error.message.includes("store name, address and contact")) return "Enter the new store's name, address and contact number.";
  if (error.message.includes("inactive")) return "A store with this name exists but is inactive. Ask Admin to activate it.";
  if (error.message.includes("unit price")) return "Enter a price greater than zero for every item.";
  if (error.message.includes("each material once")) return "Choose each item once.";
  if (error.message.includes("not active")) return "The project site or store is not active.";
  if (error.message.includes("own money")) return "Only an approved purchase paid with own money can be reimbursed.";
  if (error.message.includes("rejected")) return "This purchase was already decided.";
  return "The site purchase could not be saved. Please try again.";
}

function revalidateSitePurchases(id?: string) {
  revalidatePath("/site-purchases");
  if (id) revalidatePath(`/site-purchases/${id}`);
  revalidatePath("/inventory");
}

// Engineer (or Admin) records a hardware store purchase with its receipt photo.
export async function submitSitePurchaseAction(_: SitePurchaseActionState, form: FormData): Promise<SitePurchaseActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("engineer")) return fail("Only an Engineer can record a site purchase.");
  let lines: unknown;
  try { lines = JSON.parse(value(form, "lines")); } catch { return fail("Add at least one item."); }
  const parsed = submitSitePurchaseSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"), siteId: value(form, "siteId"),
    supplierId: value(form, "supplierId"), newSupplierName: value(form, "newSupplierName"), newSupplierAddress: value(form, "newSupplierAddress"),
    newSupplierContact: value(form, "newSupplierContact"), receiptNumber: value(form, "receiptNumber"), receiptDate: value(form, "receiptDate"),
    paidWith: value(form, "paidWith"), notes: value(form, "notes"), lines,
  });
  if (!parsed.success) return fail("Review the purchase details.", parsed.error.flatten().fieldErrors);
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); } catch (cause) { return fail(cause instanceof Error ? cause.message : "The receipt photo could not be processed."); }
  if (!photo) return fail("Add a photo of the receipt.", { photo: ["Add a photo of the receipt."] });
  const input = parsed.data;
  const supabase = await createClient();
  try { await storeSitePurchaseReceipt(supabase, user.userId, input.idempotencyKey, photo); }
  catch (cause) { return fail(cause instanceof Error ? cause.message : "The receipt photo could not be uploaded."); }
  const newStore = !input.supplierId;
  const { data, error } = await supabase.rpc("submit_site_purchase", {
    p_idempotency_key: input.idempotencyKey, p_project_id: input.projectId, p_site_id: input.siteId,
    p_supplier_id: input.supplierId || null,
    p_new_supplier_name: newStore ? input.newSupplierName : null, p_new_supplier_address: newStore ? input.newSupplierAddress : null,
    p_new_supplier_contact: newStore ? input.newSupplierContact : null,
    p_receipt_number: input.receiptNumber, p_receipt_date: input.receiptDate, p_paid_with: input.paidWith,
    p_notes: input.notes || null, p_lines: input.lines,
  });
  if (error) return fail(sitePurchaseError(error));
  revalidateSitePurchases(data);
  redirect(`/site-purchases/${data}?posted=submitted`);
}

export async function approveSitePurchaseAction(_: SitePurchaseActionState, form: FormData): Promise<SitePurchaseActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Only Admin or Finance can approve a site purchase."); }
  const id = value(form, "purchaseId");
  if (!uuidSchema.safeParse(id).success) return fail("The site purchase could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_site_purchase", { p_purchase_id: id });
  if (error) return fail(sitePurchaseError(error));
  revalidateSitePurchases(id);
  redirect(`/site-purchases/${id}?posted=approved`);
}

export async function rejectSitePurchaseAction(_: SitePurchaseActionState, form: FormData): Promise<SitePurchaseActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Only Admin or Finance can reject a site purchase."); }
  const parsed = rejectSitePurchaseSchema.safeParse({ purchaseId: value(form, "purchaseId"), reason: value(form, "reason") });
  if (!parsed.success) return fail("Enter a reason of at least three characters.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_site_purchase", { p_purchase_id: parsed.data.purchaseId, p_reason: parsed.data.reason });
  if (error) return fail(sitePurchaseError(error));
  revalidateSitePurchases(parsed.data.purchaseId);
  redirect(`/site-purchases/${parsed.data.purchaseId}?posted=rejected`);
}

export async function reimburseSitePurchaseAction(_: SitePurchaseActionState, form: FormData): Promise<SitePurchaseActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Only Admin or Finance can mark a reimbursement."); }
  const parsed = reimburseSitePurchaseSchema.safeParse({ purchaseId: value(form, "purchaseId"), reimbursedOn: value(form, "reimbursedOn"), reference: value(form, "reference") });
  if (!parsed.success) return fail("Enter the reimbursement date and reference.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_site_purchase_reimbursed", { p_purchase_id: parsed.data.purchaseId, p_reimbursed_on: parsed.data.reimbursedOn, p_reference: parsed.data.reference });
  if (error) return fail(sitePurchaseError(error));
  revalidateSitePurchases(parsed.data.purchaseId);
  redirect(`/site-purchases/${parsed.data.purchaseId}?posted=reimbursed`);
}
