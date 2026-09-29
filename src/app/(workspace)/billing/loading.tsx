import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton title="Client billing" description="Issued project invoices, partial payments, and outstanding balances." columns={6} />; }
