"use client";

import { useActionState } from "react";
import { saveSupplierAction, type SupplierActionState } from "@/app/(workspace)/suppliers/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { LocationPicker } from "@/components/ui/location-picker";
import type { SupplierCategoryRow, SupplierRow } from "@/types/database";

const initialState: SupplierActionState = { ok: false, message: "" };
export function SupplierForm({ supplier, categories }: { supplier?: SupplierRow; categories: SupplierCategoryRow[] }) {
  const [state, action, pending] = useActionState(saveSupplierAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    {supplier && <input type="hidden" name="id" value={supplier.id} />}
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Supplier code" htmlFor="code" error={error("code")}><input className={fieldControlClass} id="code" name="code" defaultValue={supplier?.code} placeholder="SUP-001" required /></FormField>
      <FormField label="Supplier category" htmlFor="categoryId" error={error("categoryId")}><select className={fieldControlClass} id="categoryId" name="categoryId" defaultValue={supplier?.category_id ?? ""} required><option value="" disabled>Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></FormField>
      <FormField label="Supplier name" htmlFor="supplierName" error={error("supplierName")}><input className={fieldControlClass} id="supplierName" name="supplierName" defaultValue={supplier?.supplier_name} required /></FormField>
      <FormField label="Registered business name" htmlFor="businessName" error={error("businessName")}><input className={fieldControlClass} id="businessName" name="businessName" defaultValue={supplier?.business_name} required /></FormField>
      <FormField label="Contact person" htmlFor="contactPerson" error={error("contactPerson")}><input className={fieldControlClass} id="contactPerson" name="contactPerson" defaultValue={supplier?.contact_person} autoComplete="name" required /></FormField>
      <FormField label="Contact number" htmlFor="contactNumber" error={error("contactNumber")}><input className={fieldControlClass} id="contactNumber" name="contactNumber" defaultValue={supplier?.contact_number} inputMode="tel" autoComplete="tel" required /></FormField>
      <FormField label="Email address" htmlFor="emailAddress" error={error("emailAddress")}><input className={fieldControlClass} id="emailAddress" name="emailAddress" type="email" defaultValue={supplier?.email_address} autoComplete="email" required /></FormField>
      <FormField label="Tax identification number" htmlFor="taxIdentificationNumber" hint="Optional; restricted to supplier/finance roles." error={error("taxIdentificationNumber")}><input className={fieldControlClass} id="taxIdentificationNumber" name="taxIdentificationNumber" defaultValue={supplier?.tax_identification_number ?? ""} /></FormField>
      <FormField label="Business address" htmlFor="businessAddress" className="md:col-span-2" error={error("businessAddress")}><input className={fieldControlClass} id="businessAddress" name="businessAddress" defaultValue={supplier?.business_address} autoComplete="street-address" required /></FormField>
      <div><LocationPicker initialLabel={supplier?.city ?? ""} />{error("municipalityCode") && <p className="mt-1 text-xs text-red-600">{error("municipalityCode")}</p>}</div>
      <FormField label="Payment terms" htmlFor="paymentTerms" hint="Recorded as agreed text; no payable automation is implied." error={error("paymentTerms")}><input className={fieldControlClass} id="paymentTerms" name="paymentTerms" defaultValue={supplier?.payment_terms} placeholder="e.g. Net 30" required /></FormField>
      <FormField label="Supplier status" htmlFor="status" error={error("status")}><select className={fieldControlClass} id="status" name="status" defaultValue={supplier?.status ?? "active"}><option value="active">Active</option><option value="inactive">Inactive</option></select></FormField>
      <FormField label="Remarks" htmlFor="remarks" className="md:col-span-2" error={error("remarks")}><textarea className={`${fieldControlClass} h-auto py-3`} id="remarks" name="remarks" rows={3} defaultValue={supplier?.remarks ?? ""} /></FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : supplier ? "Save changes" : "Register supplier"}</Button></div>
  </form>;
}
