"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { loadWorkerIdCardPreview } from "./id-card-actions";
import { PrintCardsButton } from "./id-card-forms";
import { WorkerIdCardSheet, type WorkerIdCardData } from "./worker-id-card-sheet";

export function WorkerIdCardPreview({ employeeId, projectId, label }: { employeeId?: string; projectId?: string; label: string }) {
  return <RecordCreateDialog size={employeeId ? "sm" : "default"} title="ID card preview" triggerLabel={label} triggerVariant="outline" triggerIcon={null}><Preview employeeId={employeeId} projectId={projectId} /></RecordCreateDialog>;
}

function Preview({ employeeId, projectId }: { employeeId?: string; projectId?: string }) {
  const [data, setData] = useState<WorkerIdCardData>();
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadWorkerIdCardPreview({ employeeId, projectId }).then((result) => {
      if (!active) return;
      if (result.data) setData(result.data);
      else setMessage(result.message ?? "ID cards could not be loaded.");
    }).catch(() => { if (active) setMessage("ID cards could not be loaded. Try again."); });
    return () => { active = false; };
  }, [employeeId, projectId, attempt]);
  if (message) return <div className="grid gap-4"><p role="alert" className="text-sm text-red-700">{message}</p><Button variant="outline" onClick={() => { setMessage(""); setAttempt((value) => value + 1); }}>Try again</Button></div>;
  if (!data) return <p role="status" className="text-sm text-slate-600">Loading ID cards…</p>;
  if (!data.rows.length) return <p role="status" className="text-sm text-slate-600">No active employee cards to print.</p>;
  return <div className="grid gap-5"><div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><p className="text-sm text-slate-600">{data.rows.length} card{data.rows.length === 1 ? "" : "s"}{data.projectName ? ` · ${data.projectName}` : ""}. Print, cut and laminate.</p><PrintCardsButton label="Print" /></div><WorkerIdCardSheet data={data} /></div>;
}
