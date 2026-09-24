import { redirect } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { requireUser } from "@/lib/auth";
import { getAssignableProfiles } from "@/lib/data/projects";

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!user.canManage) redirect("/projects");
  const profiles = await getAssignableProfiles();
  return <><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Project control</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em]">Create project</h1><p className="mt-1 text-sm text-slate-500">Add the core record, schedule, budget, and initial manager.</p></div><ProjectForm profiles={profiles} /></>;
}
