import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Inventory movement" title="Transfers" description="Dispatch leaves the source immediately; destination stock updates only after receipt. Approved request deliveries are received on the request." columns={6} />; }
