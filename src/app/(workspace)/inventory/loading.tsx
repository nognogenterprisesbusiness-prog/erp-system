import { PageHeader } from "@/components/ui/page-header";
import { RecordListSkeleton } from "@/components/ui/record-list-view";

export default function Loading() {
  return <><PageHeader title="Inventory" description="Materials and stock by warehouse or site." /><RecordListSkeleton storageKey="inventory" columns={9} /></>;
}
