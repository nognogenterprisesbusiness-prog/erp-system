import DetailPage from "@/app/(workspace)/materials/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Material details"><DetailPage {...props} /></RecordDetailPanel>;
}
