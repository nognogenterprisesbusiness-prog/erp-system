import DetailPage from "@/app/(workspace)/requests/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Material request"><DetailPage {...props} /></RecordDetailPanel>;
}
