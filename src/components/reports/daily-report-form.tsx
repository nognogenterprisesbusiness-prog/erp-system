"use client";

import { useActionState, useState } from "react";
import { saveDailyReportAction, type DailyReportActionState } from "@/app/(workspace)/reports/daily/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { DailyReportRow } from "@/types/database";
import { DatePicker } from "@/components/ui/date-picker";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";

type ProjectChoice = { id: string; code: string; name: string };
type SiteChoice = { id: string; project_id: string; name: string };
const initialState: DailyReportActionState = { ok: false, message: "" };

export function DailyReportForm({ report, initialId, initialProjectId, initialDate, projects, sites }: {
  report?: DailyReportRow;
  initialId: string;
  initialProjectId?: string;
  initialDate: string;
  projects: ProjectChoice[];
  sites: SiteChoice[];
}) {
  const [state, action, pending] = useActionState(saveDailyReportAction, initialState);
  const [reportId] = useState(initialId);
  const [projectId, setProjectId] = useState(report?.project_id ?? initialProjectId ?? projects[0]?.id ?? "");
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const availableSites = sites.filter((site) => site.project_id === projectId);
  const selectedSite = report?.project_id === projectId
    ? availableSites.some((site) => site.id === report.project_site_id) ? report.project_site_id : ""
    : availableSites[0]?.id ?? "";
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  const textArea = (name: keyof DailyReportRow, inputName: string, label: string, rows = 3) => (
    <FormField label={label} htmlFor={inputName} error={error(inputName)}>
      <textarea id={inputName} name={inputName} rows={rows} className={`${fieldControlClass} h-auto min-h-28 py-3`}
        defaultValue={String(report?.[name] ?? "")} />
    </FormField>
  );
  return <form action={action} className="space-y-5">
    <input type="hidden" name="id" value={reportId} />
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold">Report context</h2>
      <p className="mt-1 text-xs text-slate-500">One report covers one site and one reporting date. Multiple reports may share a date.</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="Project" htmlFor="projectId" error={error("projectId")}>
          <select id="projectId" name="projectId" className={fieldControlClass} value={projectId}
            onChange={(event) => setProjectId(event.target.value)} disabled={Boolean(report)} required>
            <option value="" disabled>Select project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
          </select>
          {report && <input type="hidden" name="projectId" value={projectId} />}
        </FormField>
        <FormField label="Project site" htmlFor="projectSiteId" error={error("projectSiteId")}>
          <select id="projectSiteId" name="projectSiteId" className={fieldControlClass} key={`${projectId}:${selectedSite}`} defaultValue={selectedSite} required>
            {!selectedSite && <option value="" disabled>{availableSites.length ? "Select an active site" : "No active sites"}</option>}
            {availableSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </FormField>
        <FormField label="Report date" htmlFor="reportDate" hint="Construction dates use Asia/Manila." error={error("reportDate")}>
          <DatePicker id="reportDate" name="reportDate" label="Report date" defaultValue={report?.report_date ?? initialDate} required allowClear={false} />
        </FormField>
      </div>
      <div className="mt-5 max-w-sm"><RecordPhotoInput label="Site photo (optional)" currentPhoto={report?.photo_path ? recordPhotoUrl("daily-reports", report.id) : undefined} convertBeforeSubmit onProcessingChange={setProcessingPhoto} /></div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold">Work and observations</h2>
      <p className="mt-1 text-xs text-slate-500">You can save an incomplete draft. Work and accomplishments are required to submit.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {textArea("work_description", "workDescription", "Work description", 5)}
        {textArea("accomplishments", "accomplishments", "Accomplishments", 5)}
        {textArea("issues_encountered", "issuesEncountered", "Issues encountered")}
        {textArea("site_observations", "siteObservations", "Site observations")}
        {textArea("general_remarks", "generalRemarks", "General remarks")}
        <FormField label="Weather conditions" htmlFor="weatherConditions" error={error("weatherConditions")}>
          <input id="weatherConditions" name="weatherConditions" className={fieldControlClass} maxLength={300}
            defaultValue={report?.weather_conditions ?? ""} placeholder="Optional" />
        </FormField>
      </div>
    </section>
    {!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-700">{state.message}</p>}
    <div className="flex flex-wrap justify-end gap-3">
      <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending || processingPhoto || !projectId || !availableSites.length}>{pending ? "Saving…" : "Save draft"}</Button>
      <Button type="submit" name="intent" value="submit" disabled={pending || processingPhoto || !projectId || !availableSites.length}>{pending ? "Submitting…" : "Submit report"}</Button>
    </div>
  </form>;
}
