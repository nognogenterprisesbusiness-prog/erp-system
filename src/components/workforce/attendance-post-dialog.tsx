"use client";

import { useRef } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { PostAttendanceForm } from "./attendance-forms";

type AssignmentChoice = { id: string; employee_id: string; start_date: string; end_date: string | null; employee?: { code: string; first_name: string; last_name: string } };

export function AttendancePostDialog({ projectId, assignments, idempotencyKey, today }: { projectId: string; assignments: AssignmentChoice[]; idempotencyKey: string; today: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <Button onClick={() => dialog.current?.showModal()} disabled={assignments.length === 0}><HugeiconsIcon icon={PlusSignIcon} size={16} />Mark attendance</Button>
    <dialog ref={dialog} className="m-auto w-[min(100%-2rem,700px)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45 sm:p-6" aria-labelledby="post-attendance-dialog-title">
      <DialogHeading id="post-attendance-dialog-title" title="Mark attendance" onClose={() => dialog.current?.close()} />
      <div className="mt-4"><PostAttendanceForm projectId={projectId} assignments={assignments} idempotencyKey={idempotencyKey} today={today} embedded /></div>
    </dialog>
  </>;
}
