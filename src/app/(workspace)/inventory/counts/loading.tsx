import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton title="Stock counts" description="Count what is on hand. An Admin reviews any shortage before stock changes." columns={6} />; }
