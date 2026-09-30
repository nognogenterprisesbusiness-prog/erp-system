import { ListPageSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() { return <ListPageSkeleton eyebrow="Asset identification" title="QR codes" description="Labels identify records only; they never grant access or move stock." columns={5} />; }
