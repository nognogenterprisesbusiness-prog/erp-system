import DetailPage from "@/app/(workspace)/purchase-orders/approvals/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Purchase approval"><DetailPage {...props} /></RecordDetailPanel>;
}
