import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Inventory catalog" title="Material categories" description="Categories are stored once and reused throughout the catalog." columns={3} filters={0} />; }
