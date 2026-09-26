import { redirect } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { requireUser } from "@/lib/auth";
import { getAssignableProfiles, getProject } from "@/lib/data/projects";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user.canManage) redirect(`/projects/${id}`);
  const [{ project }, profiles] = await Promise.all([getProject(id), getAssignableProfiles("engineer")]);
  return <><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{project.code}</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em]">Edit project</h1><p className="mt-1 text-sm text-slate-500">Update controlled project fields and save an auditable change.</p></div><ProjectForm project={project} profiles={profiles} /></>;
}
