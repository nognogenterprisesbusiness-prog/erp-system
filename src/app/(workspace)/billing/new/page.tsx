import { randomUUID } from "node:crypto";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { IssueInvoiceForm } from "@/components/billing/billing-forms";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireFinanceViewer } from "@/lib/auth";
import { getBillableProjects } from "@/lib/data/billing";

export default async function NewInvoicePage() {
  await requireFinanceViewer();
  const projects = await getBillableProjects();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <>
    <PageHeader title="New invoice" description="Issue a project invoice against the agreed contract amount." action={<Button variant="outline" asChild><Link href="/billing">Cancel</Link></Button>} />
    <div className="mt-7 max-w-4xl">{projects.length ? <IssueInvoiceForm projects={projects} idempotencyKey={randomUUID()} today={today} /> : <div className="rounded-xl border border-slate-200 bg-white"><EmptyState title="No billable projects" description="An active project with a contract amount is needed before an invoice can be issued." /></div>}</div>
  </>;
}
