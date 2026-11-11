import DetailPage from "@/app/(workspace)/warehouses/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Warehouse details"><DetailPage {...props} /></RecordDetailPanel>;
}
