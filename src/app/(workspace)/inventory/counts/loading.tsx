import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton title="Stock counts" description="Record physical quantities; an administrator reviews a shortage before stock and value change." columns={6} />; }
