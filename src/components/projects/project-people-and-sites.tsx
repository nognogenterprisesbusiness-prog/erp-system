import { IntentLink as Link } from "@/components/layout/intent-link";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GenerateQrForm } from "@/components/qr/qr-action-form";
import type { getProject } from "@/lib/data/projects";
import type { getActiveQrCodesForEntities } from "@/lib/data/qr-codes";
import { createProjectSiteAction, updateProjectSiteStaffAction } from "@/app/(workspace)/projects/actions";

type ProjectData = Awaited<ReturnType<typeof getProject>>;
const inputClass = "h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10";
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "Not recorded";

// Earlier project-wide assignments, read-only. Engineers and Foremen are now
// set on each site in the Sites tab.
export function ProjectPersonnelSection({ data }: { data: ProjectData }) {
  const { assignments } = data;
  if (assignments.length === 0) return null;
  return (<section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Earlier project assignments</h2><p className="mt-1 text-xs text-slate-500">History only. Engineers and Foremen are set on each site in the Sites tab.</p>
      <div className="mt-2 divide-y divide-slate-100">{assignments.map((assignment) => <div key={assignment.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{assignment.profile?.full_name ?? "Unavailable profile"}</p><p className="mt-0.5 text-xs capitalize text-slate-500">{assignment.assignment_role.replace("_", " ")} · Assigned {date(assignment.assigned_on)}</p></div><Badge variant={assignment.status === "active" ? "active" : "neutral"}>{assignment.status === "active" ? "active" : "ended"}</Badge></div>)}</div>
    </section>);
}

export function ProjectSitesSection({ data, canManage, qrCodes }: { data: ProjectData; canManage: boolean; qrCodes: Awaited<ReturnType<typeof getActiveQrCodesForEntities>> }) {
  const { project: { id }, sites, profiles, engineers, foremen } = data;
  const siteQrById = new Map(qrCodes.map((code) => [code.entity_id, code]));
  const profileName = (profileId: string | null) => profiles.find((profile) => profile.id === profileId)?.full_name ?? "Unassigned";
  return (<section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Project sites</h2><p className="mt-1 text-xs text-slate-500">Each site uses the project name and address. Choose who runs it.</p>{canManage && <form action={createProjectSiteAction} className="mt-5 grid gap-3 border-b border-slate-100 pb-5 md:grid-cols-[1fr_1fr_auto]"><input type="hidden" name="projectId" value={id} /><label className="grid min-w-0 content-start gap-2 text-sm font-medium">Engineer<select className={inputClass} name="engineerId" defaultValue="" aria-label="Engineer"><option value="">No engineer</option>{engineers.map((profile) => <option value={profile.id} key={profile.id}>{profile.full_name}</option>)}</select></label><label className="grid min-w-0 content-start gap-2 text-sm font-medium">Foreman<select className={inputClass} name="foremanId" defaultValue="" aria-label="Foreman"><option value="">No foreman</option>{foremen.map((profile) => <option value={profile.id} key={profile.id}>{profile.full_name}</option>)}</select></label><Button type="submit" className="self-start md:mt-7"><HugeiconsIcon icon={PlusSignIcon} size={16} /> Add site</Button></form>}
      {sites.length === 0 ? <EmptyState compact kind="items" title="No sites recorded" /> : <div className="mt-4 grid gap-4 md:grid-cols-2">{sites.map((site) => <article key={site.id} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-semibold">{site.name}</h3><p className="mt-1 text-xs text-slate-500">{site.address}</p></div><Badge variant={site.status === "active" ? "active" : "neutral"}>{site.status}</Badge></div>{canManage ? <form action={updateProjectSiteStaffAction} className="mt-4 grid grid-cols-2 gap-3 text-xs"><input type="hidden" name="projectId" value={id} /><input type="hidden" name="siteId" value={site.id} /><label className="grid min-w-0 content-start gap-1"><span className="text-slate-400">Engineer</span><select className={inputClass} name="engineerId" defaultValue={site.engineer_id ?? ""}><option value="">No engineer</option>{engineers.map((profile) => <option value={profile.id} key={profile.id}>{profile.full_name}</option>)}</select></label><label className="grid min-w-0 content-start gap-1"><span className="text-slate-400">Foreman</span><select className={inputClass} name="foremanId" defaultValue={site.foreman_id ?? ""}><option value="">No foreman</option>{foremen.map((profile) => <option value={profile.id} key={profile.id}>{profile.full_name}</option>)}</select></label><div className="col-span-2 flex justify-end"><Button type="submit" variant="outline" size="sm">Save staff</Button></div></form> : <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">Engineer</dt><dd className="mt-1 font-medium">{profileName(site.engineer_id)}</dd></div><div><dt className="text-slate-400">Foreman</dt><dd className="mt-1 font-medium">{profileName(site.foreman_id)}</dd></div></dl>}{canManage && <div className="mt-4 border-t border-slate-100 pt-4">{siteQrById.get(site.id) ? <Button asChild variant="outline" size="sm"><Link href={`/qr-codes/${siteQrById.get(site.id)!.id}`}>View QR label</Link></Button> : <GenerateQrForm entityType="project_site" entityId={site.id} />}</div>}</article>)}</div>}
    </section>);
}
