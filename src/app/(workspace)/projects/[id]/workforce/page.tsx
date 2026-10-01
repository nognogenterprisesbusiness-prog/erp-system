import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectPersonnelSection } from "@/components/projects/project-people-and-sites";
import { ProjectWorkforceSection } from "@/components/workforce/project-workforce-section";
import { requireManager } from "@/lib/auth";
import { getProject } from "@/lib/data/projects";
import { getProjectWorkforce } from "@/lib/data/workforce";

// Admin-only: assign and end worker and personnel assignments. The project's
// Labour tab shows the read-only overview.
export default async function ProjectWorkforcePage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!uuidSchema.safeParse(id).success) notFound();
  try { await requireManager(); } catch { notFound(); }
  const [data, workforce] = await Promise.all([getProject(id), getProjectWorkforce(id, true)]);
  return <>
    <PageHeader eyebrow={data.project.code} title="Manage workers" description={`Assign workers and site personnel for ${data.project.name}.`} action={<Button variant="outline" asChild><Link href={`/projects/${id}?tab=labour`}>Back to labour</Link></Button>} />
    <ProjectWorkforceSection projectId={id} projectName={data.project.name} workforce={workforce} canManage canViewRates />
    <ProjectPersonnelSection data={data} canManage />
  </>;
}
