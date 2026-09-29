import { IntentLink as Link } from "@/components/layout/intent-link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { EmployeeForm } from "@/components/workforce/employee-form";
import { ArchiveEmployeeForm, AttendanceBasisForm, CloseLaborRateForm, EndAssignmentForm, LaborRateForm, TransferAssignmentForm, WorkforceAssignmentForm } from "@/components/workforce/workforce-forms";
import { requireUser } from "@/lib/auth";
import { getEmployee } from "@/lib/data/workforce";

const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "Present";
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const editing = (await searchParams).edit === "1";
  const { id } = await params;
  const [user, data] = await Promise.all([requireUser(), getEmployee(id)]);
  const { employee, category, contact, linkedProfile, assignments, rates, events, references } = data;
  return <>
    <PageHeader eyebrow={employee.code} title={employee.fullName} description={`${category.name} · ${employee.employment_type}`} action={user.canManage && employee.status !== "separated" && <RecordCreateDialog key={employee.updated_at} title="Edit employee" triggerLabel="Edit employee" triggerVariant="outline" initialOpen={editing} closeHref={`/employees/${id}`}><EmployeeForm employee={data.employee} contact={data.contact} categories={data.references.categories} profiles={data.references.profiles} /></RecordCreateDialog>} />
    <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Employee record</h2><p className="mt-1 text-xs text-slate-500">Identity and employment information</p></div><Badge variant={employee.status === "active" ? "active" : employee.status === "on_leave" ? "review" : "neutral"}>{employee.status.replace("_", " ")}</Badge></div><dl className="grid gap-x-8 gap-y-5 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs text-slate-400">Category / trade</dt><dd className="mt-1 text-sm font-medium">{category.name}</dd></div><div><dt className="text-xs text-slate-400">Hire date</dt><dd className="mt-1 text-sm font-medium">{date(employee.hire_date)}</dd></div><div><dt className="text-xs text-slate-400">User account</dt><dd className="mt-1 text-sm font-medium">{linkedProfile ? linkedProfile.full_name : "No linked account"}</dd></div><div><dt className="text-xs text-slate-400">Contact</dt><dd className="mt-1 text-sm font-medium">{contact?.contact_number ?? "Restricted"}</dd></div></dl>{user.canManage && employee.status !== "separated" && <div className="border-t border-slate-100 px-6 py-4"><ArchiveEmployeeForm employeeId={id} /></div>}</section>

    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div><h2 className="font-semibold">Project assignments</h2><p className="mt-1 text-xs text-slate-500">Current and past positions by project site. Assignments do not grant application access.</p></div>
        {user.canManage && employee.status === "active" && <RecordCreateDialog title="Assign employee" triggerLabel="Assign to project"><WorkforceAssignmentForm fixedEmployeeId={id} employees={[{ id, fullName: employee.fullName }]} projects={references.projects} sites={references.sites} /></RecordCreateDialog>}
      </div>
      {assignments.length === 0 ? <EmptyState compact kind="items" title="No project assignments" /> : (
        <div className="divide-y divide-slate-100">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Link href={`/projects/${assignment.project_id}`} className="text-sm font-semibold hover:text-cyan-700">{assignment.projectName}</Link><Badge variant={assignment.status === "active" ? "active" : "neutral"}>{assignment.status}</Badge></div>
                <p className="mt-1 text-sm text-slate-600">{assignment.position_title} · {assignment.siteName}</p>
                <p className="mt-1 text-xs text-slate-400">{date(assignment.start_date)} – {date(assignment.end_date)} · Assigned by {assignment.assignedByName}</p>
                {assignment.remarks && <p className="mt-2 text-xs text-slate-500">{assignment.remarks}</p>}
              </div>
              {user.canManage && assignment.status === "active" && (
                <div className="flex flex-wrap gap-2">
                  <RecordCreateDialog title="Transfer employee" triggerLabel="Transfer" triggerVariant="outline" triggerIcon={null}>
                    <p className="mb-4 text-sm text-slate-600">Move {employee.fullName} from {assignment.siteName} to another project site.</p>
                    <TransferAssignmentForm assignment={assignment} projects={references.projects} sites={references.sites} />
                  </RecordCreateDialog>
                  <RecordCreateDialog title="End assignment" triggerVariant="outline" triggerIcon={null}>
                    <p className="mb-4 text-sm text-slate-600">End the {assignment.position_title} assignment at {assignment.siteName}.</p>
                    <EndAssignmentForm assignment={assignment} />
                  </RecordCreateDialog>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>

    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div><h2 className="font-semibold">Labor rate history</h2><p className="mt-1 text-xs text-slate-500">Effective dates preserve each version of this employee&apos;s rate.</p></div>
        {user.canManage && <div className="flex flex-wrap gap-2">
          <RecordCreateDialog title="Set attendance costing basis" triggerLabel="Costing basis" triggerVariant="outline" triggerIcon={null}><AttendanceBasisForm employeeId={id} /></RecordCreateDialog>
          <RecordCreateDialog title="Add labor rate" triggerLabel="Add rate"><LaborRateForm employeeId={id} /></RecordCreateDialog>
        </div>}
      </div>
      {!user.canViewLaborRates && employee.profile_id !== user.userId ? <p className="px-6 py-10 text-center text-sm text-slate-500">Labor rates are restricted to authorized workforce and finance roles.</p> : rates.length === 0 ? <EmptyState compact kind="items" title="No labor rates configured" /> : (
        <div className="divide-y divide-slate-100">
          {rates.map((rate) => (
            <div key={rate.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="text-sm font-semibold">{money.format(rate.rate_amount)} / {rate.rate_type === "daily" ? "day" : "hour"}</p>
                <p className="mt-1 text-xs text-slate-500">Effective {date(rate.effective_start_date)} – {date(rate.effective_end_date)} · Approved by {rate.approvedByName}</p>
              </div>
              {user.canManage && !rate.effective_end_date && <RecordCreateDialog title="Close labor rate" triggerLabel="Close rate" triggerVariant="outline" triggerIcon={null}>
                <p className="mb-4 text-sm text-slate-600">Set the final effective date for {money.format(rate.rate_amount)} per {rate.rate_type === "daily" ? "day" : "hour"}.</p>
                <CloseLaborRateForm employeeId={id} rate={rate} />
              </RecordCreateDialog>}
            </div>
          ))}
        </div>
      )}
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-2"><article className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold">Attendance history</h2><p className="mt-1 text-xs text-slate-500">Recorded attendance and work hours</p></div><EmptyState compact kind="items" title="No attendance records" /></article><article className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold">Record history</h2><p className="mt-1 text-xs text-slate-500">A history of changes to this employee&apos;s record.</p></div>{events.length === 0 ? <EmptyState compact kind="items" title="No history available" /> : <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">{events.map((event) => <div key={event.id} className="px-6 py-4"><p className="text-sm font-medium">{event.summary}</p><p className="mt-1 text-xs text-slate-400">{event.actorName} · {dateTime(event.occurred_at)}</p></div>)}</div>}</article></section>
  </>;
}
