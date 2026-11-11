import { RecordDetailPanel } from "./record-detail-panel";

export default function LoadingRecordDetails() {
  return <RecordDetailPanel title="Record details"><p role="status" className="py-8 text-sm text-slate-600">Loading record details…</p></RecordDetailPanel>;
}
