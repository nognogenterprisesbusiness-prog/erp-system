"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveProjectAction, type ProjectActionState } from "@/app/(workspace)/projects/actions";
import { Button } from "@/components/ui/button";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { LocationPicker } from "@/components/ui/location-picker";
import { SelectPicker } from "@/components/ui/select-picker";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { ProfileRow, ProjectRow } from "@/types/database";

const initialState: ProjectActionState = { ok: false, message: "" };
const inputClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10";
function Field({ label, name, error, children }: { label: string; name: string; error?: string[]; children: React.ReactNode }) { return <label className="space-y-2 text-sm font-medium text-slate-700" htmlFor={name}><span>{label}</span>{children}{error?.[0] && <span className="block text-xs text-red-600">{error[0]}</span>}</label>; }

export function ProjectForm({ project, profiles }: { project?: ProjectRow; profiles: Pick<ProfileRow, "id" | "full_name">[] }) {
  const [state, action, pending] = useActionState(saveProjectAction, initialState);
  const [photoBusy, setPhotoBusy] = useState(false);
  const error = (name: string) => state.ok ? undefined : state.fieldErrors?.[name];
  return <form action={action} className="space-y-8">
    {project && <input type="hidden" name="id" value={project.id} />}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-semibold">Project information</h2><div className="mt-5 grid gap-5 md:grid-cols-2">
      <Field label="Project code" name="code" error={error("code")}><input id="code" name="code" className={inputClass} defaultValue={project?.code} placeholder="NNE-2026-001" required /></Field>
      <Field label="Project name" name="name" error={error("name")}><input id="name" name="name" className={inputClass} defaultValue={project?.name} required /></Field>
      <div className="md:col-span-2"><RecordPhotoInput label="Project photo" currentPhoto={project?.photo_path ? recordPhotoUrl("projects", project.id) : undefined} convertBeforeSubmit onProcessingChange={setPhotoBusy} /></div>
      <Field label="Client name" name="clientName" error={error("clientName")}><input id="clientName" name="clientName" className={inputClass} defaultValue={project?.client_name} required /></Field>
      <Field label="Client email" name="clientEmail" error={error("clientEmail")}><input id="clientEmail" name="clientEmail" type="email" className={inputClass} defaultValue={project?.client_email ?? ""} /></Field>
      <Field label="Client phone" name="clientPhone" error={error("clientPhone")}><input id="clientPhone" name="clientPhone" className={inputClass} defaultValue={project?.client_phone ?? ""} /></Field>
      <div><LocationPicker initialCode={project?.municipality_code ?? ""} initialLabel={project?.city_province.split(",")[0] ?? ""} />{error("municipalityCode")?.[0] && <p className="mt-1 text-xs text-red-600">{error("municipalityCode")?.[0]}</p>}</div>
      <div className="md:col-span-2"><Field label="Address" name="address" error={error("address")}><input id="address" name="address" className={inputClass} defaultValue={project?.address} required /></Field></div>
      <div className="md:col-span-2"><Field label="Description" name="description" error={error("description")}><textarea id="description" name="description" rows={4} className={`${inputClass} h-auto py-3`} defaultValue={project?.description ?? ""} /></Field></div>
    </div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-semibold">Schedule and budget</h2><div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Start date" name="startDate" error={error("startDate")}><input id="startDate" name="startDate" type="date" className={inputClass} defaultValue={project?.start_date} required /></Field>
      <Field label="Target completion" name="targetCompletionDate" error={error("targetCompletionDate")}><input id="targetCompletionDate" name="targetCompletionDate" type="date" className={inputClass} defaultValue={project?.target_completion_date} required /></Field>
      <Field label="Actual completion" name="actualCompletionDate" error={error("actualCompletionDate")}><input id="actualCompletionDate" name="actualCompletionDate" type="date" className={inputClass} defaultValue={project?.actual_completion_date ?? ""} /></Field>
      <Field label="Contract amount (PHP)" name="contractAmount" error={error("contractAmount")}><input id="contractAmount" name="contractAmount" inputMode="decimal" className={inputClass} defaultValue={project?.contract_amount ?? ""} required /></Field>
      <Field label="Initial budget (PHP)" name="initialBudget" error={error("initialBudget")}><input id="initialBudget" name="initialBudget" inputMode="decimal" className={inputClass} defaultValue={project?.initial_budget ?? ""} required /></Field>
      <Field label="Status" name="status" error={error("status")}><SelectPicker label="Status" name="status" defaultValue={project?.status ?? "draft"} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} /></Field>
      <Field label="Project manager" name="projectManagerId" error={error("projectManagerId")}><select id="projectManagerId" name="projectManagerId" className={inputClass} defaultValue={project?.project_manager_id ?? ""}><option value="">Not assigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></Field>
    </div></section>
    {!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-600">{state.message}</p>}
    {state.ok && "message" in state && <p role="status" className="text-sm text-amber-700">{state.message} <Link className="underline" href={`/projects/${state.data.id}`}>Open saved project</Link></p>}
    <div className="flex justify-end"><Button type="submit" size="lg" disabled={pending || photoBusy}>{pending || photoBusy ? "Saving…" : project ? "Save changes" : "Create project"}</Button></div>
  </form>;
}
