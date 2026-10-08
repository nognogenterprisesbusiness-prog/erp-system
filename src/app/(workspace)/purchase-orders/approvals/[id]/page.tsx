import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { PurchaseApprovalForm } from "@/components/purchase-orders/purchase-order-forms";
import { requireProcurementViewer } from "@/lib/auth";
import { getPurchaseApprovalRequest } from "@/lib/data/purchase-approvals";

const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export default async function PurchaseApprovalPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posted?: string }>;
}) {
  const user = await requireProcurementViewer();
  const { request, input, supplierName, warehouseName, requestedByName, decidedByName, lines } =
    await getPurchaseApprovalRequest((await params).id);
  const query = await searchParams;
  return <>
    <PageHeader eyebrow="Purchasing & suppliers" title="Owner approval" description={`${supplierName} · ${warehouseName}`}
      action={<Button variant="outline" asChild><Link href="/purchase-orders">Back to purchases</Link></Button>} />
    {query.posted === "rejected" && <p role="status" className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">Purchase rejected. No order, supplier price, or stock was posted.</p>}
    <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-semibold text-slate-900">{request.status === "pending" ? "Waiting for Admin owner approval" : request.status === "approved" ? "Approved" : "Rejected"}</p>
          <p className="mt-1">Submitted by {requestedByName} · Purchase date {input.orderedOn}{input.expectedOn ? ` · Expected ${input.expectedOn}` : ""}</p>
          {input.purpose && <p className="mt-2">{input.purpose}</p>}
          {decidedByName && <p className="mt-2">Decision by {decidedByName}{request.decision_reason ? ` · ${request.decision_reason}` : ""}</p>}
        </div>
        <strong className="text-lg tabular-nums text-slate-900">{peso(Number(request.order_total))}</strong>
      </div>
      <p className="mt-4 text-sm text-slate-600">Purchases above ₱50,000 need this approval before a purchase order is issued. Submission alone does not update supplier prices or inventory.</p>
      {request.purchase_order_id && <Button variant="outline" asChild className="mt-4"><Link href={`/purchase-orders/${request.purchase_order_id}`}>View issued purchase order</Link></Button>}
      {request.status === "pending" && user.canManage && <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-5">
        <RecordCreateDialog title="Approve purchase" triggerLabel="Approve"><p className="mb-4 text-sm text-slate-600">Review the supplier, warehouse, every item and the {peso(Number(request.order_total))} total before issuing the order.</p><PurchaseApprovalForm requestId={request.id} decision="approve" /></RecordCreateDialog>
        <RecordCreateDialog title="Reject purchase" triggerLabel="Reject" triggerVariant="outline"><PurchaseApprovalForm requestId={request.id} decision="reject" /></RecordCreateDialog>
      </div>}
    </section>
    <h2 className="mt-8 text-lg font-semibold text-slate-900">Items awaiting purchase</h2>
    <DataTableShell footer={<span className="text-xs text-slate-500">{lines.length} item{lines.length === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[650px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <th className="px-5 py-3">Material</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Unit price</th><th className="px-5 py-3">Line total</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line) => <tr key={line.materialId}>
        <td className="px-5 py-4"><span className="font-medium text-slate-900">{line.materialName}</span><p className="text-xs text-slate-500">{line.materialCode}</p></td>
        <td className="px-4 py-4 tabular-nums">{line.quantity}</td>
        <td className="px-4 py-4 tabular-nums">{peso(Number(line.unitPrice))}</td>
        <td className="px-5 py-4 font-semibold tabular-nums">{peso(Math.round(Number(line.quantity) * Number(line.unitPrice) * 100) / 100)}</td>
      </tr>)}</tbody></table>
    </DataTableShell>
  </>;
}
