import DetailPage from "@/app/(workspace)/site-purchases/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Site purchase"><DetailPage {...props} /></RecordDetailPanel>;
}
