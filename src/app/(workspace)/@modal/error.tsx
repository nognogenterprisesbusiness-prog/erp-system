"use client";

import { RecordDetailPanel } from "@/components/ui/record-detail-panel";
import RecordPanelError from "@/components/ui/record-panel-error";

export default function RecordError({ reset }: { reset: () => void }) {
  return <RecordDetailPanel title="Record details"><RecordPanelError reset={reset} /></RecordDetailPanel>;
}
