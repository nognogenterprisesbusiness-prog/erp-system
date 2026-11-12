import DetailPage from "@/app/(workspace)/purchase-orders/quotations/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Supplier quotation"><DetailPage {...props} /></RecordDetailPanel>;
}
