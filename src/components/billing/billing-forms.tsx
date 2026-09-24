"use client";

import { useActionState } from "react";
import { issueInvoiceAction, recordPaymentAction, reversePaymentAction, voidInvoiceAction, type BillingActionState } from "@/app/(workspace)/billing/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";

const initialState: BillingActionState = { message: "" };
type BillableProject = { id: string; code: string; name: string; client_name: string; contract_amount: number };

export function IssueInvoiceForm({ projects, idempotencyKey, today }: { projects: BillableProject[]; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(issueInvoiceAction, initialState);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Project" htmlFor="projectId" error={error("projectId")}
        hint="Invoices for a project cannot exceed its contract value.">
        <SelectPicker name="projectId" label="Project" options={projects.map((project) => ({ value: project.id, label: `${project.code} · ${project.name} · ${project.client_name}` }))} placeholder="Choose project" />
      </FormField>
      <FormField label="Amount (PHP)" htmlFor="amount" error={error("amount")}>
        <input id="amount" name="amount" type="text" inputMode="decimal" className={fieldControlClass} placeholder="0.00" required />
      </FormField>
      <FormField label="Issue date" htmlFor="issuedOn" error={error("issuedOn")}><DatePicker id="issuedOn" name="issuedOn" label="Issue date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Due date" htmlFor="dueOn" error={error("dueOn")}><DatePicker id="dueOn" name="dueOn" label="Due date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Description" htmlFor="description" error={error("description")} className="md:col-span-2">
        <textarea id="description" name="description" className={`${fieldControlClass} h-auto py-3`} rows={3} maxLength={300} placeholder="Progress billing for agreed construction work" required />
      </FormField>
    </div>
    {state.message && <p role="alert" className="mt-4 text-sm text-red-700">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button type="submit" disabled={pending || projects.length === 0}>{pending ? "Issuing…" : "Issue invoice"}</Button></div>
  </form>;
}

export function RecordPaymentForm({ invoiceId, idempotencyKey, today, outstanding }: { invoiceId: string; idempotencyKey: string; today: string; outstanding: number }) {
  const [state, action, pending] = useActionState(recordPaymentAction, initialState);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="invoiceId" value={invoiceId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <h2 className="text-base font-semibold text-slate-900">Record a payment</h2>
    <p className="mt-1 text-xs text-slate-500">Outstanding balance: {formatPhp(outstanding)}. Partial payments are supported.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <FormField label="Amount (PHP)" htmlFor="paymentAmount" error={error("amount")}><input id="paymentAmount" name="amount" type="text" inputMode="decimal" className={fieldControlClass} placeholder="0.00" required /></FormField>
      <FormField label="Payment date" htmlFor="paidOn" error={error("paidOn")}><DatePicker id="paidOn" name="paidOn" label="Payment date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Receipt / bank reference" htmlFor="reference" error={error("reference")}><input id="reference" name="reference" className={fieldControlClass} maxLength={100} placeholder="OR-12345" required /></FormField>
    </div>
    {state.message && <p role="alert" className="mt-4 text-sm text-red-700">{state.message}</p>}
    <div className="mt-5 flex justify-end"><Button type="submit" disabled={pending || outstanding <= 0}>{pending ? "Recording…" : "Record payment"}</Button></div>
  </form>;
}

export function BillingCorrectionForm({ kind, invoiceId, paymentId, idempotencyKey }: { kind: "reverse" | "void"; invoiceId: string; paymentId?: string; idempotencyKey?: string }) {
  const [state, action, pending] = useActionState(kind === "reverse" ? reversePaymentAction : voidInvoiceAction, initialState);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="invoiceId" value={invoiceId} />
    {paymentId && <input type="hidden" name="paymentId" value={paymentId} />}
    {idempotencyKey && <input type="hidden" name="idempotencyKey" value={idempotencyKey} />}
    <FormField label={kind === "reverse" ? "Reversal reason" : "Void reason"} htmlFor={`${kind}-${paymentId ?? invoiceId}`} error={state.fieldErrors?.reason?.[0]}>
      <input id={`${kind}-${paymentId ?? invoiceId}`} name="reason" className={fieldControlClass} minLength={3} maxLength={500} required />
    </FormField>
    {state.message && <p role="alert" className="text-xs text-red-700">{state.message}</p>}
    <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Saving…" : kind === "reverse" ? "Reverse payment" : "Void invoice"}</Button>
  </form>;
}

export function formatPhp(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}
