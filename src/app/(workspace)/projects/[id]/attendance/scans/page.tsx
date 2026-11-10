import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { uuidSchema, philippinesDate, scanClock } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pageNumber } from "@/lib/data/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HistoryPagination } from "@/components/ui/history-pagination";

export default async function AttendanceScansPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("foreman")) notFound();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const query = await searchParams;
  const parsedDate = z.iso.date().safeParse(query.date);
  const date = parsedDate.success ? parsedDate.data : philippinesDate();
  const page = pageNumber(query.page);
  const db = await createClient();
  const [project, scans] = await Promise.all([
    db.from("projects").select("code,name").eq("id", id).maybeSingle(),
    db.from("attendance_scans").select("id,employee_id,project_site_id,scan_type,scanned_at", { count: "exact" }).eq("project_id", id).eq("work_date", date)
      .order("scanned_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1),
  ]);
  if (project.error || scans.error) throw new Error("Attendance scans could not be loaded.");
  if (!project.data) notFound();
  const items = scans.data ?? [];
  const employeeIds = [...new Set(items.map(s => s.employee_id))];
  const siteIds = [...new Set(items.map(s => s.project_site_id))];
  const [workers, photos, sites] = await Promise.all([
    employeeIds.length ? db.from("employees").select("id,code,first_name,last_name").in("id", employeeIds) : { data: [], error: null },
    items.length ? db.from("attendance_scan_photos").select("scan_id").in("scan_id", items.map(s => s.id)) : { data: [], error: null },
    siteIds.length ? db.from("project_sites").select("id,name").in("id", siteIds) : { data: [], error: null },
  ]);
  if (workers.error || photos.error || sites.error) throw new Error("Attendance evidence could not be loaded.");
  const names = new Map(workers.data?.map(w => [w.id, w]));
  const photoIds = new Set(photos.data?.map(p => p.scan_id));
  const siteNames = new Map(sites.data?.map(s => [s.id, s.name]));
  return <>
    <PageHeader title="ID scans & face photos" description={`${project.data.code} · ${project.data.name}`} action={<Button asChild variant="outline"><Link href={`/projects/${id}/attendance`}>Back to attendance</Link></Button>} />
    <p className="mt-4 text-sm text-slate-600">Each saved time-in or time-out shows the worker ID and its face photo. Scans are evidence; reviewed attendance posts work hours separately.</p>
    <form className="my-6 flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-medium">Scan date<input type="date" name="date" defaultValue={date} required className="rounded-lg border border-slate-200 bg-white px-3 py-2" /></label><Button type="submit">Show scans</Button></form>
    {!items.length ? <EmptyState title="No ID scans for this date" description="Saved time-in and time-out scans will appear here. Cancelled QR verifications do not record attendance." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(s => {
      const worker = names.get(s.employee_id);
      return <article key={s.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {photoIds.has(s.id) ? <Image src={`/attendance-photos/${s.id}`} alt={`Face photo for ${worker?.first_name ?? "worker"} at ${s.scan_type === "in" ? "time-in" : "time-out"}`} width={480} height={360} unoptimized className="h-56 w-full bg-slate-50 object-contain" /> : <p className="flex h-36 items-center justify-center bg-slate-50 text-sm text-slate-500">Earlier scan · no face photo recorded</p>}
        <div className="space-y-1 p-4"><h2 className="font-semibold">{worker ? `${worker.first_name} ${worker.last_name}` : "Worker"}</h2><p className="text-sm text-slate-500">{worker?.code} · {siteNames.get(s.project_site_id)}</p><p className="text-sm font-medium">{s.scan_type === "in" ? "Time-in" : "Time-out"} · {scanClock(s.scanned_at)}</p></div>
      </article>;
    })}</div>}
    <HistoryPagination path={`/projects/${id}/attendance/scans`} page={page} count={scans.count ?? 0} filters={{ date }} />
  </>;
}
