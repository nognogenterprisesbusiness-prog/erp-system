"use client";

import { useActionState } from "react";
import { saveEmployeeAction, type WorkforceActionState } from "@/app/(workspace)/employees/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { EmployeeCategoryRow, EmployeePrivateContactRow, EmployeeRow, ProfileRow } from "@/types/database";

const initialState: WorkforceActionState = { ok: false, message: "" };

export function EmployeeForm({ employee, contact, categories, profiles }: {
  employee?: EmployeeRow;
  contact?: EmployeePrivateContactRow | null;
  categories: EmployeeCategoryRow[];
  profiles: Pick<ProfileRow, "id" | "full_name" | "email">[];
}) {
  const [state, action, pending] = useActionState(saveEmployeeAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    {employee && <input type="hidden" name="id" value={employee.id} />}
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Employee code" htmlFor="code" error={error("code")}>
        <input className={fieldControlClass} id="code" name="code" defaultValue={employee?.code} placeholder="EMP-001" required />
      </FormField>
      <FormField label="Category / trade" htmlFor="categoryId" error={error("categoryId")}>
        <select className={fieldControlClass} id="categoryId" name="categoryId" defaultValue={employee?.category_id ?? ""} required>
          <option value="" disabled>Select category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </FormField>
      <FormField label="First name" htmlFor="firstName" error={error("firstName")}>
        <input className={fieldControlClass} id="firstName" name="firstName" defaultValue={employee?.first_name} autoComplete="given-name" required />
      </FormField>
      <FormField label="Middle name" htmlFor="middleName" error={error("middleName")}>
        <input className={fieldControlClass} id="middleName" name="middleName" defaultValue={employee?.middle_name ?? ""} autoComplete="additional-name" />
      </FormField>
      <FormField label="Last name" htmlFor="lastName" error={error("lastName")}>
        <input className={fieldControlClass} id="lastName" name="lastName" defaultValue={employee?.last_name} autoComplete="family-name" required />
      </FormField>
      <FormField label="Contact number" htmlFor="contactNumber" hint="Visible only to authorized workforce/finance roles and the linked employee." error={error("contactNumber")}>
        <input className={fieldControlClass} id="contactNumber" name="contactNumber" defaultValue={contact?.contact_number} inputMode="tel" autoComplete="tel" required />
      </FormField>
      <FormField label="Email address" htmlFor="emailAddress" hint="Optional; visible to authorized workforce/finance roles and the linked employee." error={error("emailAddress")}>
        <input className={fieldControlClass} id="emailAddress" name="emailAddress" type="email" maxLength={320} defaultValue={contact?.email_address ?? ""} autoComplete="email" />
      </FormField>
      <FormField label="Employment type" htmlFor="employmentType" hint="Validated text until the client approves a controlled employment-type list." error={error("employmentType")}>
        <input className={fieldControlClass} id="employmentType" name="employmentType" defaultValue={employee?.employment_type} placeholder="Regular, project-based, contractor…" required />
      </FormField>
      <FormField label="Hire date" htmlFor="hireDate" error={error("hireDate")}>
        <input className={fieldControlClass} id="hireDate" name="hireDate" type="date" defaultValue={employee?.hire_date} required />
      </FormField>
      <FormField label="Employment status" htmlFor="status" hint="Separated employees are created through the archive workflow." error={error("status")}>
        <select className={fieldControlClass} id="status" name="status" defaultValue={employee?.status === "separated" ? "inactive" : employee?.status ?? "active"}>
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option>
        </select>
      </FormField>
      <FormField label="Optional user account" htmlFor="profileId" hint="Linking is optional and does not automatically grant project access." error={error("profileId")}>
        <select className={fieldControlClass} id="profileId" name="profileId" defaultValue={employee?.profile_id ?? ""}>
          <option value="">No user account</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {profile.email}</option>)}
        </select>
      </FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : employee ? "Save changes" : "Register employee"}</Button></div>
  </form>;
}
