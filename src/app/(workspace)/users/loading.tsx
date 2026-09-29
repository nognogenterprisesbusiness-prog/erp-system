import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton title="Users" description="Manage team accounts and access." columns={4} filters={1} />; }
