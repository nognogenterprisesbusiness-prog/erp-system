"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeSupplierPriceInputSchema,
  supplierCategoryInputSchema,
  supplierInputSchema,
  supplierMaterialInputSchema,
  supplierPriceInputSchema,
  uuidSchema,
} from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import { createClient } from "@/lib/supabase/server";

export type SupplierActionState =
  | { ok: true; data?: { id?: string }; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string, fieldErrors?: Record<string, string[]>): SupplierActionState => ({ ok: false, message, fieldErrors });

function friendlySupplierError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to manage supplier records.";
  if (error.code === "23505") return "That supplier code, tax number, category, or catalog relationship is already in use.";
  if (error.code === "23P01" || error.message.includes("overlap")) return "This price overlaps an existing price period for the supplier material.";
  if (error.message.includes("category")) return "The selected supplier category is unavailable.";
  if (error.message.includes("base unit") || error.message.includes("unit")) return "Supplier catalog entries must use the material base unit until conversions are approved.";
  if (error.message.includes("active supplier catalog")) return "Archive each active catalog entry before archiving this supplier.";
  if (error.message.includes("current supplier price")) return "Close the current price before archiving this catalog entry.";
  return "The supplier change could not be saved.";
}

function revalidateSuppliers(supplierId?: string) {
  revalidatePath("/suppliers");
  revalidatePath("/suppliers/prices");
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
}

export async function saveSupplierAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage suppliers."); }
  const municipalityCode = value(form, "municipalityCode");
  if (!/^\d{10}$/.test(municipalityCode)) return failure("Choose a city or municipality from the list.", { municipalityCode: ["Choose a city or municipality from the list."] });
  const supabase = await createClient();
  const { data: municipality, error: locationError } = await supabase.from("geo_municipalities").select("display_name,province_name").eq("code", municipalityCode).eq("selectable", true).single();
  if (locationError || !municipality) return failure("Choose a valid city or municipality.", { municipalityCode: ["Choose a city or municipality from the list."] });
  const parsed = supplierInputSchema.safeParse({
    id: value(form, "id") || undefined,
    code: value(form, "code").toUpperCase(),
    supplierName: value(form, "supplierName"),
    businessName: value(form, "businessName"),
    categoryId: value(form, "categoryId"),
    contactPerson: value(form, "contactPerson"),
    contactNumber: value(form, "contactNumber"),
    emailAddress: value(form, "emailAddress"),
    businessAddress: value(form, "businessAddress"),
    city: municipality.display_name,
    province: municipality.province_name,
    taxIdentificationNumber: value(form, "taxIdentificationNumber"),
    paymentTerms: value(form, "paymentTerms"),
    status: value(form, "status"),
    remarks: value(form, "remarks"),
  });
  if (!parsed.success) return failure("Review the highlighted supplier details.", parsed.error.flatten().fieldErrors);
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); }
  catch (cause) { return failure(cause instanceof Error ? cause.message : "The supplier photo could not be processed."); }
  const input = parsed.data;
  const { data, error } = await supabase.rpc("save_supplier", {
    p_id: input.id ?? null, p_code: input.code, p_supplier_name: input.supplierName, p_business_name: input.businessName,
    p_category_id: input.categoryId, p_contact_person: input.contactPerson, p_contact_number: input.contactNumber,
    p_email_address: input.emailAddress, p_business_address: input.businessAddress, p_city: input.city, p_province: input.province,
    p_tax_identification_number: input.taxIdentificationNumber, p_payment_terms: input.paymentTerms, p_status: input.status, p_remarks: input.remarks || "",
  });
  if (error) return failure(friendlySupplierError(error));
  if (photo) {
    try { await saveRecordPhoto("suppliers", data, photo); }
    catch (cause) {
      revalidateSuppliers(data);
      return { ok: true, data: { id: data }, message: cause instanceof Error ? cause.message : "Supplier saved, but the photo could not be attached. Open the supplier to retry." };
    }
  }
  revalidateSuppliers(data);
  return { ok: true, data: { id: data } };
}

export async function archiveSupplierAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to archive suppliers."); }
  const id = uuidSchema.safeParse(value(form, "id"));
  const reason = value(form, "reason").trim();
  if (!id.success || reason.length < 3 || reason.length > 500) return failure("Enter an archive reason of 3 to 500 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_supplier", { p_id: id.data, p_reason: reason });
  if (error) return failure(friendlySupplierError(error));
  revalidateSuppliers(id.data);
  redirect("/suppliers?status=archived");
}

export async function saveSupplierCategoryAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage supplier categories."); }
  const parsed = supplierCategoryInputSchema.safeParse({ id: value(form, "id") || undefined, name: value(form, "name"), description: value(form, "description") });
  if (!parsed.success) return failure("Review the category details.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_supplier_category", { p_id: parsed.data.id ?? null, p_name: parsed.data.name, p_description: parsed.data.description || "" });
  if (error) return failure(friendlySupplierError(error));
  revalidatePath("/suppliers"); revalidatePath("/suppliers/categories");
  redirect("/suppliers/categories");
}

export async function archiveSupplierCategoryAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to archive supplier categories."); }
  const id = uuidSchema.safeParse(value(form, "id"));
  if (!id.success) return failure("Invalid supplier category.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_supplier_category", { p_id: id.data });
  if (error) return failure(friendlySupplierError(error));
  revalidatePath("/suppliers"); revalidatePath("/suppliers/categories");
  return { ok: true, message: "Supplier category archived." };
}

export async function saveSupplierMaterialAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage supplier catalogs."); }
  const parsed = supplierMaterialInputSchema.safeParse({
    id: value(form, "id") || undefined, supplierId: value(form, "supplierId"), materialId: value(form, "materialId"), unitId: value(form, "unitId"),
    supplierMaterialCode: value(form, "supplierMaterialCode").toUpperCase(), minimumOrderQuantity: value(form, "minimumOrderQuantity"),
    leadTimeDays: value(form, "leadTimeDays"), availabilityStatus: value(form, "availabilityStatus"),
  });
  if (!parsed.success) return failure("Review the supplier material details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_supplier_material", {
    p_id: input.id ?? null, p_supplier_id: input.supplierId, p_material_id: input.materialId,
    p_supplier_material_code: input.supplierMaterialCode, p_unit_id: input.unitId,
    p_minimum_order_quantity: input.minimumOrderQuantity, p_lead_time_days: input.leadTimeDays === "" ? null : input.leadTimeDays,
    p_availability_status: input.availabilityStatus,
  });
  if (error) return failure(friendlySupplierError(error));
  revalidateSuppliers(input.supplierId);
  return { ok: true, message: input.id ? "Catalog entry updated." : "Material added to supplier catalog.", data: { id: data } };
}

export async function archiveSupplierMaterialAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to archive supplier catalog entries."); }
  const id = uuidSchema.safeParse(value(form, "id"));
  if (!id.success) return failure("Invalid supplier catalog entry.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_supplier_material", { p_id: id.data });
  if (error) return failure(friendlySupplierError(error));
  revalidateSuppliers(value(form, "supplierId") || undefined);
  return { ok: true, message: "Catalog entry archived." };
}

export async function addSupplierPriceAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage supplier prices."); }
  const parsed = supplierPriceInputSchema.safeParse({ supplierMaterialId: value(form, "supplierMaterialId"), unitPrice: value(form, "unitPrice"), effectiveStartDate: value(form, "effectiveStartDate"), effectiveEndDate: value(form, "effectiveEndDate"), currency: value(form, "currency").toUpperCase() });
  if (!parsed.success) return failure("Review the supplier price details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_supplier_price", { p_supplier_material_id: input.supplierMaterialId, p_unit_price: input.unitPrice, p_effective_start_date: input.effectiveStartDate, p_effective_end_date: input.effectiveEndDate || null, p_currency: input.currency });
  if (error) return failure(friendlySupplierError(error));
  revalidateSuppliers(value(form, "supplierId") || undefined);
  return { ok: true, message: "Supplier price version added.", data: { id: data } };
}

export async function closeSupplierPriceAction(_: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to close supplier prices."); }
  const parsed = closeSupplierPriceInputSchema.safeParse({ priceId: value(form, "priceId"), effectiveEndDate: value(form, "effectiveEndDate") });
  if (!parsed.success) return failure("Enter a valid price end date.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_supplier_price", { p_price_id: parsed.data.priceId, p_effective_end_date: parsed.data.effectiveEndDate });
  if (error) return failure(friendlySupplierError(error));
  revalidateSuppliers(value(form, "supplierId") || undefined);
  return { ok: true, message: "Supplier price closed." };
}
