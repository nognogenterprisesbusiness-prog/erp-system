"use client";

import { Button } from "./button";

export default function RecordPanelError({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
    <h3 className="font-semibold">Couldn’t load this record</h3>
    <p className="text-sm text-slate-600">Try again, or close this panel to return to the list.</p>
    <Button onClick={reset}>Try again</Button>
  </div>;
}
