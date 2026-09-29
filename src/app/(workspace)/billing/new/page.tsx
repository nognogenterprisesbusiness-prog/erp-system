import { IntentLink as Link } from "@/components/layout/intent-link";
import { NewInvoiceContent } from "@/components/billing/new-invoice-content";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireFinanceViewer } from "@/lib/auth";

export default async function NewInvoicePage() {
  await requireFinanceViewer();
  return <>
    <PageHeader title="New invoice" description="Issue a project invoice against the agreed contract amount." action={<Button variant="outline" asChild><Link href="/billing">Cancel</Link></Button>} />
    <div className="mt-7 max-w-4xl"><NewInvoiceContent /></div>
  </>;
}
