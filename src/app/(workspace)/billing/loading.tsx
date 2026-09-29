import { BillingListShell } from "@/components/billing/billing-list-shell";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <><BillingListShell /><TableSkeleton columns={7} filters={0} /></>; }
