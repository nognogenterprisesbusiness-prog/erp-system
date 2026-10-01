import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton title="Stock history" description="Every stock in, stock out, transfer and use. Corrections keep the original entry." columns={7} filters={3} />; }
