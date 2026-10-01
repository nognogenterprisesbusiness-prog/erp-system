import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Inventory movement" title="Transfers" description="Stock leaves the source when it is sent and arrives when the destination receives it." columns={6} />; }
