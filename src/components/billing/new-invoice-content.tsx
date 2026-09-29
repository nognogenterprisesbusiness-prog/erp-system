import { randomUUID } from "node:crypto";
import { IssueInvoiceForm } from "@/components/billing/billing-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { getBillableProjects } from "@/lib/data/billing";

export async function NewInvoiceContent() {
  const projects = await getBillableProjects();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return projects.length
    ? <IssueInvoiceForm projects={projects} idempotencyKey={randomUUID()} today={today} />
    : <div className="rounded-xl border border-slate-200 bg-white"><EmptyState title="No billable projects" description="An active project with a contract amount is needed before an invoice can be issued." /></div>;
}
