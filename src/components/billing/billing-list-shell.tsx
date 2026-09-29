import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";

export function BillingListShell({ query = "" }: { query?: string }) {
  return <><PageHeader title="Client billing" description="Issued project invoices, partial payments, and outstanding balances." action={<Button asChild><Link href="/billing/new"><HugeiconsIcon icon={PlusSignIcon} size={17} /> New invoice</Link></Button>} />
    <ListFilterBar className="mt-7"><SearchField key={query} name="q" label="Search invoices" defaultValue={query} placeholder="Search invoice, client, or description" wrapperClassName="w-full max-w-sm" /></ListFilterBar></>;
}
