import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Supplier settings" title="Supplier categories" description="Group suppliers into categories that make them easier to organize." columns={3} filters={0} />; }
