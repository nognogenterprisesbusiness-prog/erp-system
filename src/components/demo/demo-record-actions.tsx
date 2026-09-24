"use client";

import { useState } from "react";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { DemoRecordDetailDialog, type RecordDetail } from "./demo-record-detail-dialog";

export function DemoRecordActions({ name, busy, onEdit, onDelete, onView, details, photo }: {
  name: string;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onView?: () => void;
  details?: RecordDetail[];
  photo?: string;
}) {
  const [viewing, setViewing] = useState(false);
  return <>
    <RecordActionMenu name={name} disabled={busy} actions={[
      { label: "View", onSelect: () => onView ? onView() : setViewing(true) },
      { label: "Edit", onSelect: onEdit },
      { label: "Delete", onSelect: onDelete, destructive: true },
    ]} />
    {!onView && viewing && <DemoRecordDetailDialog name={name} photo={photo} details={details ?? []} onClose={() => setViewing(false)} />}
  </>;
}
