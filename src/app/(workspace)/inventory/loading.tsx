import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Materials control" title="Inventory" description="Stock balances" columns={6} filters={3} />; }
