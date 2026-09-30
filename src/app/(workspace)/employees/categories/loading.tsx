import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Employee settings" title="Employee categories" description="Manage the trades and job categories used for employees." columns={3} filters={0} />; }
