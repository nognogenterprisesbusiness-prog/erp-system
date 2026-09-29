import { WarehouseListControls, warehouseListHeader } from "@/components/warehouses/warehouse-list-controls";
import { PageHeader } from "@/components/ui/page-header";
import { RecordListSkeleton } from "@/components/ui/record-list-view";

export default function Loading() { return <><PageHeader {...warehouseListHeader} /><WarehouseListControls /><RecordListSkeleton storageKey="warehouses" columns={5} /></>; }
