import DetailPage from "@/app/(workspace)/employees/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  return <RecordDetailPanel title="Employee details"><DetailPage {...props} /></RecordDetailPanel>;
}
