import { TableSkeleton } from "@/components/ui/table-skeleton";

// The list renders its own title, so only the records are placeholders.
export default function Loading() { return <TableSkeleton filters={2} />; }
