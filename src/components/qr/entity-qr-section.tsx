import { IntentLink as Link } from "@/components/layout/intent-link";
import Image from "next/image";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { GenerateQrForm } from "@/components/qr/qr-action-form";
import { getActiveQrCode } from "@/lib/data/qr-codes";
import type { QrEntityType } from "@/types/database";

export async function EntityQrSection({ entityType, entityId, canManage, recordName }: { entityType: QrEntityType; entityId: string; canManage: boolean; recordName?: string }) {
  if (!canManage) return null;
  const code = await getActiveQrCode(entityType, entityId);
  return <section className="mt-5 flex flex-wrap items-center justify-between gap-4">
    <div><h2 className="text-sm font-semibold">QR label</h2><p className="mt-1 text-sm text-slate-500">{code ? "View or print the identification label." : "No active label for this record."}</p></div>
    {code ? <RecordCreateDialog title={recordName ? `${recordName} QR label` : "QR identification label"} triggerLabel="View QR label" triggerIcon={null} triggerVariant="outline" triggerSize="sm">
      <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-5"><Image src={`/qr-codes/${code.id}/image?format=svg`} width={220} height={220} alt="QR identification label" unoptimized /></div>
      <p className="mt-3 break-all text-center font-mono text-xs text-slate-500">{code.public_identifier}</p>
      <div className="mt-5 flex justify-end"><Button variant="outline" asChild><Link href={`/qr-codes/${code.id}/label`} target="_blank">Print label</Link></Button></div>
    </RecordCreateDialog> : <GenerateQrForm entityType={entityType} entityId={entityId} />}
  </section>;
}
