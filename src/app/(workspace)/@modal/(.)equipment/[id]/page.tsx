import DetailPage from "@/app/(workspace)/equipment/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Equipment details"><DetailPage {...props} /></RecordDetailPanel>;
}
