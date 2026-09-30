import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Supplier intelligence" title="Material price comparison" description="Compare current prices only when they reference the same material base unit and currency; supplier choice remains an authorized decision." columns={6} />; }
