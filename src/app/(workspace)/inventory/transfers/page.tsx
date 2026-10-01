import { IntentLink as Link } from "@/components/layout/intent-link";
import { uuidSchema } from "@nognog/domain";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { InventoryMovementForm } from "@/components/inventory/inventory-movement-form";
import { ReceiveTransferForm } from "@/components/inventory/transaction-action-form";
import { TransferVarianceForm } from "@/components/inventory/transfer-variance-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getInventoryOptions, getInventoryTransfers } from "@/lib/data/inventory";
import { pageNumber } from "@/lib/data/pagination";

type Filters = { new?: string; siteReturn?: string; receive?: string; variance?: string; material?: string; page?: string };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const params = await searchParams;
  const page = pageNumber(params.page);
  const [user, transferData] = await Promise.all([requireUser(), getInventoryTransfers(page)]);
  const transfers = transferData.rows;
  const options = (params.new || params.siteReturn) && (user.canManage || user.canOperateInventory) ? await getInventoryOptions() : null;
  const parsedMaterial = uuidSchema.safeParse(params.material);
  const actionHref = (key: "receive" | "variance", id: string) => `/inventory/transfers?${new URLSearchParams({ page: String(page), [key]: id })}`;
  const pageHref = `/inventory/transfers?page=${page}`;
  const receiving = user.canOperateInventory && params.receive ? transfers.find((item) => item.item?.id === params.receive && !item.requestBound && item.status !== "received" && item.status !== "cancelled") : undefined;
  const variance = !receiving && user.canManage && params.variance ? transfers.find((item) => item.item?.id === params.variance && !item.requestBound && item.status !== "received" && item.status !== "cancelled") : undefined;

  return <>
    <PageHeader eyebrow="Inventory movement" title="Transfers" description="Stock leaves the source when it is sent and arrives when the destination receives it." action={<div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild><Link href="/inventory">Back</Link></Button>
      {user.canManage && <Button variant="outline" asChild><Link href={params.siteReturn ? pageHref : `${pageHref}&siteReturn=1`}>{params.siteReturn ? "Close return" : "Return site stock"}</Link></Button>}
      {user.canOperateInventory && <Button asChild><Link href={params.new ? pageHref : `${pageHref}&new=1`}>{params.new ? "Close form" : "New transfer"}</Link></Button>}
    </div>} />

    {params.new && options && !params.siteReturn && !receiving && !variance && user.canOperateInventory && <RecordCreateDialog title="Transfer stock" initialOpen hideTrigger closeHref={pageHref}><InventoryMovementForm mode="transfer" initialMaterialId={parsedMaterial.success ? parsedMaterial.data : ""} {...options} /></RecordCreateDialog>}
    {params.siteReturn && options && !receiving && !variance && user.canManage && <RecordCreateDialog title="Return site stock" initialOpen hideTrigger closeHref={pageHref}><InventoryMovementForm mode="return" initialMaterialId={parsedMaterial.success ? parsedMaterial.data : ""} {...options} /></RecordCreateDialog>}
    {receiving?.item && <RecordCreateDialog title="Receive transfer" initialOpen hideTrigger closeHref={pageHref}><ReceiveTransferForm itemId={receiving.item.id} remaining={receiving.item.dispatched_quantity - receiving.item.received_quantity - receiving.item.variance_quantity} /></RecordCreateDialog>}
    {variance?.item && <RecordCreateDialog title="Review missing or damaged stock" initialOpen hideTrigger closeHref={pageHref}><TransferVarianceForm expanded itemId={variance.item.id} remaining={variance.item.dispatched_quantity - variance.item.received_quantity - variance.item.variance_quantity} unit={variance.material?.unitSymbol ?? ""} returnPath={pageHref} /></RecordCreateDialog>}

    <DataTableShell empty={transfers.length === 0 ? <EmptyState kind="items" title="No inventory transfers" description="Transfers will appear here after stock is dispatched between locations." /> : undefined}>
      <table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr>
        <th className="px-5 py-3">Transfer</th><th className="px-4 py-3">Material</th><th className="px-4 py-3">Route</th><th className="px-4 py-3 text-right">Dispatched</th><th className="px-4 py-3 text-right">In transit</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{transfers.map((item) => {
        const inTransit = item.status === "cancelled" ? 0 : (item.item?.dispatched_quantity ?? 0) - (item.item?.received_quantity ?? 0) - (item.item?.variance_quantity ?? 0);
        return <tr key={item.id}>
          <td className="px-5 py-4"><p className="font-semibold">{item.transfer_number}</p><p className="text-xs text-slate-500">{item.external_reference}</p></td>
          <td className="px-4 py-4">{item.material?.name ?? "Unavailable"}</td>
          <td className="px-4 py-4 text-slate-600">{item.source?.name} → {item.destination?.name}</td>
          <td className="px-4 py-4 text-right tabular-nums">{item.item?.dispatched_quantity ?? 0} {item.material?.unitSymbol}</td>
          <td className="px-4 py-4 text-right font-semibold tabular-nums">{inTransit} {item.material?.unitSymbol}</td>
          <td className="px-4 py-4"><Badge variant={item.status === "received" ? "active" : item.status === "cancelled" ? "neutral" : "review"}>{item.item?.variance_quantity ? item.status === "received" ? "Reconciled with variance" : "Partial · variance" : item.status.replace("_", " ")}</Badge></td>
          <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">
            {item.requestBound ? <span className="text-xs text-slate-500">Material request</span> : user.canOperateInventory && inTransit > 0 && item.item && item.status !== "cancelled" ? <Button variant="ghost" size="sm" asChild><Link href={actionHref("receive", item.item.id)}>Receive</Link></Button> : null}
            {user.canManage && !item.requestBound && inTransit > 0 && item.item && <Button variant="ghost" size="sm" asChild><Link href={actionHref("variance", item.item.id)}>Variance</Link></Button>}
          </div></td>
        </tr>;
      })}</tbody></table>
    </DataTableShell>
    <HistoryPagination path="/inventory/transfers" page={page} count={transferData.count} pageSize={25} />
  </>;
}
