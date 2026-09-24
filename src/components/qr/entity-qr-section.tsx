import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GenerateQrForm } from "@/components/qr/qr-action-form";
import { getActiveQrCode } from "@/lib/data/qr-codes";
import type { QrEntityType } from "@/types/database";

export async function EntityQrSection({ entityType, entityId, canManage }: { entityType: QrEntityType; entityId: string; canManage: boolean }) {
  if (!canManage) return null;
  const code = await getActiveQrCode(entityType, entityId);
  return <section className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
    <div><h2 className="font-semibold">QR identification</h2><p className="mt-1 text-sm text-slate-500">{code ? code.public_identifier : "No active label for this record."}</p></div>
    {code ? <Button asChild variant="outline" size="sm"><Link href={`/qr-codes/${code.id}`}>View label</Link></Button> : <GenerateQrForm entityType={entityType} entityId={entityId} />}
  </section>;
}
