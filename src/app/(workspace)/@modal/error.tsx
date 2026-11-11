"use client";

import { RecordDetailPanel } from "@/components/ui/record-detail-panel";
import { Button } from "@/components/ui/button";

export default function RecordError({ reset }: { reset: () => void }) {
  return <RecordDetailPanel title="Record details"><div role="alert" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Couldn’t load this record</h3><p className="text-sm text-slate-600">Try again, or close this panel to return to the list.</p><Button onClick={reset}>Try again</Button></div></RecordDetailPanel>;
}
