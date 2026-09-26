"use client";
import { useActionState } from "react";
import { attachReportResource, detachReportResource } from "@/app/(workspace)/reports/daily/resource-actions";
import { Button } from "@/components/ui/button";
export function ReportResourceForm({ reportId, resourceId, kind, detach = false }: { reportId: string; resourceId: string; kind: string; detach?: boolean }) {
  const [state, action, pending] = useActionState(detach ? detachReportResource : attachReportResource, { ok: false, message: "" });
  return <form action={action}><input type="hidden" name="reportId" value={reportId} /><input type="hidden" name="resourceId" value={resourceId} /><input type="hidden" name="kind" value={kind} /><Button size="sm" variant="outline" disabled={pending || state.ok}>{pending ? "Saving…" : state.ok ? "Saved" : detach ? "Remove link" : "Attach"}</Button>{state.message && <p role="status" className="mt-2 text-xs">{state.message}</p>}</form>;
}
