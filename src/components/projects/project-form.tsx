"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveProjectAction, type ProjectActionState } from "@/app/(workspace)/projects/actions";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { LocationPicker } from "@/components/ui/location-picker";
import { SelectPicker } from "@/components/ui/select-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { ProfileRow, ProjectRow } from "@/types/database";

const initialState: ProjectActionState = { ok: false, message: "" };
const inputClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10";
function Field({ label, name, error, children }: { label: string; name: string; error?: string[]; children: React.ReactNode }) {
  return <div className="grid min-w-0 content-start gap-2 text-sm">
    <label className="font-medium leading-5 text-slate-700" htmlFor={name}>{label}</label>
    {children}
    {error?.[0] && <span role="alert" className="text-xs text-red-600">{error[0]}</span>}
  </div>;
}

export function ProjectForm({ project, profiles }: { project?: ProjectRow; profiles: Pick<ProfileRow, "id" | "full_name">[] }) {
  const [state, action, pending] = useActionState(saveProjectAction, initialState);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [engineerId, setEngineerId] = useState(project?.project_manager_id ?? "unassigned");
  const error = (name: string) => state.ok ? undefined : state.fieldErrors?.[name];
  return <form action={action} className="space-y-8">
    {project && <input type="hidden" name="id" value={project.id} />}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-semibold">Project information</h2><div className="mt-5 grid gap-5 md:grid-cols-2">
      <Field label="Project code" name="code" error={error("code")}><input id="code" name="code" className={inputClass} defaultValue={project?.code} placeholder="NNE-2026-001" required /></Field>
      <Field label="Project name" name="name" error={error("name")}><input id="name" name="name" className={inputClass} defaultValue={project?.name} required /></Field>
      <div className="md:col-span-2"><RecordPhotoInput label="Project photo" currentPhoto={project?.photo_path ? recordPhotoUrl("projects", project.id, project.updated_at) : undefined} convertBeforeSubmit onProcessingChange={setPhotoBusy} />{state.ok && "message" in state && <p role="status" className="mt-2 text-sm text-amber-700">{state.message} <Link className="underline" href={`/projects/${state.data.id}`}>Open saved project</Link></p>}</div>
      <Field label="Client name" name="clientName" error={error("clientName")}><input id="clientName" name="clientName" className={inputClass} defaultValue={project?.client_name} required /></Field>
      <Field label="Client email" name="clientEmail" error={error("clientEmail")}><input id="clientEmail" name="clientEmail" type="email" className={inputClass} defaultValue={project?.client_email ?? ""} /></Field>
      <Field label="Client phone" name="clientPhone" error={error("clientPhone")}><input id="clientPhone" name="clientPhone" className={inputClass} defaultValue={project?.client_phone ?? ""} /></Field>
      <div><LocationPicker initialCode={project?.municipality_code ?? ""} initialLabel={project?.city_province.split(",")[0] ?? ""} />{error("municipalityCode")?.[0] && <p className="mt-1 text-xs text-red-600">{error("municipalityCode")?.[0]}</p>}</div>
      <div className="md:col-span-2"><Field label="Address" name="address" error={error("address")}><input id="address" name="address" className={inputClass} defaultValue={project?.address} required /></Field></div>
      <div className="md:col-span-2"><Field label="Description" name="description" error={error("description")}><textarea id="description" name="description" rows={4} className={`${inputClass} h-auto py-3`} defaultValue={project?.description ?? ""} /></Field></div>
    </div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-semibold">Schedule and budget</h2><div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Start date" name="startDate" error={error("startDate")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="startDate" name="startDate" label="Start date" defaultValue={project?.start_date} required allowClear={false} /></Field>
      <Field label="Target completion" name="targetCompletionDate" error={error("targetCompletionDate")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="targetCompletionDate" name="targetCompletionDate" label="Target completion" defaultValue={project?.target_completion_date} required allowClear={false} /></Field>
      <Field label="Actual completion" name="actualCompletionDate" error={error("actualCompletionDate")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="actualCompletionDate" name="actualCompletionDate" label="Actual completion" defaultValue={project?.actual_completion_date ?? ""} /></Field>
      <div><PesoAmountInput name="contractAmount" label="Contract amount" defaultValue={String(project?.contract_amount ?? "")} submitUngrouped required />{error("contractAmount")?.[0] && <p role="alert" className="mt-1 text-xs text-red-600">{error("contractAmount")?.[0]}</p>}</div>
      <div><PesoAmountInput name="initialBudget" label="Initial budget" defaultValue={String(project?.initial_budget ?? "")} submitUngrouped required />{error("initialBudget")?.[0] && <p role="alert" className="mt-1 text-xs text-red-600">{error("initialBudget")?.[0]}</p>}</div>
      <Field label="Status" name="status" error={error("status")}><SelectPicker id="status" className="h-11" label="Status" name="status" defaultValue={project?.status ?? "draft"} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} /></Field>
      <Field label="Lead engineer" name="projectManagerId" error={error("projectManagerId")}><input type="hidden" name="projectManagerId" value={engineerId === "unassigned" ? "" : engineerId} /><SelectPicker id="projectManagerId" className="h-11" label="Lead engineer" value={engineerId} onValueChange={setEngineerId} options={[{ value: "unassigned", label: "Not assigned" }, ...profiles.map((profile) => ({ value: profile.id, label: profile.full_name }))]} /></Field>
    </div></section>
    {!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-600">{state.message}</p>}
    <RecordFormControls busy={pending || photoBusy} />
  </form>;
}
