"use client";

import { useFormStatus } from "react-dom";
import { RecordFormControls } from "./record-create-dialog";

export function PendingFormControls({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <RecordFormControls busy={pending} label={label} />;
}
