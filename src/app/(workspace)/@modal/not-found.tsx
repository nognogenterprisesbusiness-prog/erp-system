import { RecordDetailPanel } from "@/components/ui/record-detail-panel";

export default function RecordUnavailable() {
  return <RecordDetailPanel title="Record unavailable"><p className="rounded-xl border border-slate-200 bg-white p-5 text-sm">This record is unavailable or your account cannot open it. Close this panel to return to the list.</p></RecordDetailPanel>;
}
