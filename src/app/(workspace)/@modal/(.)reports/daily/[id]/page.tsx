import DetailPage from "@/app/(workspace)/reports/daily/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Daily report"><DetailPage {...props} /></RecordDetailPanel>;
}
