import DetailPage from "@/app/(workspace)/vehicles/[id]/page";
import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default async function DetailPanelPage(props: Parameters<typeof DetailPage>[0]) {
  if ((await props.searchParams).edit === "1") return <DetailPage {...props} editOnly />;
  return <RecordDetailPanel title="Vehicle details"><DetailPage {...props} /></RecordDetailPanel>;
}
