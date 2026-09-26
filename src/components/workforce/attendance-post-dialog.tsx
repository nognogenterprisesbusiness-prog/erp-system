"use client";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { PostAttendanceForm } from "./attendance-forms";
type AssignmentChoice = { id: string; employee_id: string; start_date: string; end_date: string | null; employee?: { code: string; first_name: string; last_name: string } };
export function AttendancePostDialog(props: { projectId: string; assignments: AssignmentChoice[]; idempotencyKey: string; today: string }) {
  return <RecordCreateDialog title="Mark attendance"><PostAttendanceForm {...props} embedded /></RecordCreateDialog>;
}
