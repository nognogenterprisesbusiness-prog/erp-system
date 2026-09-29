import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Inventory catalog" title="Materials" description="Maintain one reusable material catalog with explicit units and categories." columns={6} filters={3} />; }
