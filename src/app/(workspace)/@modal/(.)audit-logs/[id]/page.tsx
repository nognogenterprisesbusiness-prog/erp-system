import DetailPage from "@/app/(workspace)/audit-logs/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Audit details"><DetailPage {...props} /></RecordDetailPanel>;
}
