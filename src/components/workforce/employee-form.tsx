"use client";
import { FieldsSkeleton } from "@/components/ui/loading-state";
import { RemoteSelectPicker } from "@/components/ui/remote-select-picker";
import { SelectPicker } from "@/components/ui/select-picker";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadEmployeeFormReferences, saveEmployeeAction, type WorkforceActionState } from "@/app/(workspace)/employees/actions";
import { DatePicker } from "@/components/ui/date-picker";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
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
  const dialog = useRecordDialog();
  const router = useRouter();
  const completed = useRef(false);
  useEffect(() => {
    // A message means a partial save (e.g. photo failed): keep the form open to show it.
    if (!state.ok || state.message || completed.current) return;
    completed.current = true;
    if (employee && dialog) dialog.complete();
    else if (state.data?.id) {
      dialog?.complete();
      startTransition(() => router.replace(`/employees/${state.data?.id}`));
    }
  }, [state, dialog, router, employee]);

  const [profileId, setProfileId] = useState(employee?.profile_id ?? "unassigned");
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className={dialog ? undefined : "rounded-xl border border-slate-200 bg-white p-5 sm:p-6"}>
    {employee && <input type="hidden" name="id" value={employee.id} />}
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Employee code" htmlFor="code" error={error("code")}>
        <input className={fieldControlClass} id="code" name="code" defaultValue={employee?.code} placeholder="EMP-001" required />
      </FormField>
      <FormField label="Job / trade" htmlFor="categoryId" error={error("categoryId")}>
        <SelectPicker id="categoryId" name="categoryId" label="Job / trade" defaultValue={employee?.category_id} required placeholder="Select job / trade" options={categories.map((item) => ({ value: item.id, label: item.name }))} />
      </FormField>
      <FormField label="First name" htmlFor="firstName" error={error("firstName")}>
        <input className={fieldControlClass} id="firstName" name="firstName" defaultValue={employee?.first_name} autoComplete="given-name" required />
      </FormField>
      <FormField label="Last name" htmlFor="lastName" error={error("lastName")}>
        <input className={fieldControlClass} id="lastName" name="lastName" defaultValue={employee?.last_name} autoComplete="family-name" required />
      </FormField>
      <FormField label="Contact number" htmlFor="contactNumber" hint="Private. Only Admin, Finance and this employee can see it." error={error("contactNumber")}>
        <input className={fieldControlClass} id="contactNumber" name="contactNumber" defaultValue={contact?.contact_number} inputMode="tel" autoComplete="tel" required />
      </FormField>
      <FormField label="Employment type" htmlFor="employmentType" error={error("employmentType")}>
        <input className={fieldControlClass} id="employmentType" name="employmentType" defaultValue={employee?.employment_type} placeholder="Regular, project-based, contractor…" required />
      </FormField>
      <FormField label="Hire date" htmlFor="hireDate" error={error("hireDate")}>
        <DatePicker id="hireDate" name="hireDate" label="Hire date" defaultValue={employee?.hire_date} required allowClear={false} />
      </FormField>
      <FormField label="Employment status" htmlFor="status" error={error("status")}>
        <SelectPicker id="status" name="status" label="Employment status" defaultValue={employee?.status === "separated" ? "inactive" : employee?.status ?? "active"} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "on_leave", label: "On leave" }]} />
      </FormField>
    </div>
    <details className="mt-5 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">Contact and account details</summary><div className="mt-4 grid gap-5 md:grid-cols-2">      <FormField label="Middle name" htmlFor="middleName" error={error("middleName")}>
        <input className={fieldControlClass} id="middleName" name="middleName" defaultValue={employee?.middle_name ?? ""} autoComplete="additional-name" />
      </FormField>
      <FormField label="Email address" htmlFor="emailAddress" hint="Optional. Only Admin, Finance and this employee can see it." error={error("emailAddress")}>
        <input className={fieldControlClass} id="emailAddress" name="emailAddress" type="email" maxLength={320} defaultValue={contact?.email_address ?? ""} autoComplete="email" />
      </FormField>
      <FormField label="Optional user account" htmlFor="profileId" hint="Optional. This does not give project access." error={error("profileId")}>
        <><input type="hidden" name="profileId" value={profileId === "unassigned" ? "" : profileId} /><RemoteSelectPicker kind="profile" id="profileId" label="User account" value={profileId} onValueChange={setProfileId} emptyOption={{ value: "unassigned", label: "No user account" }} initialOption={profiles[0] ? { value: profiles[0].id, label: profiles[0].full_name, secondary: profiles[0].email } : undefined} /></>
      </FormField>
</div></details>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <RecordFormControls busy={pending} />
  </form>;
}

export function NewEmployeeForm() {
  const [references, setReferences] = useState<Awaited<ReturnType<typeof loadEmployeeFormReferences>>>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadEmployeeFormReferences().then(data => { if (active) setReferences(data); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  if (failed) return <div role="alert"><p>Employee options could not be loaded.</p><button type="button" className="mt-3 rounded-full border px-4 py-3" onClick={() => {setFailed(false);setAttempt(value=>value+1);}}>Try again</button></div>;
  return references ? <EmployeeForm categories={references.categories} profiles={references.profiles} /> : <FieldsSkeleton label="Loading employee options" />;
}
