import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton title="Stock history" description="Stock in, stock out, transfers and usage are recorded automatically. Corrections preserve the original record." columns={7} filters={3} />; }
