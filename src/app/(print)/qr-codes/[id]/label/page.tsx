import Image from "next/image";
import Link from "next/link";
import { PrintLabelButton } from "@/components/qr/print-label-button";
import { requireUser } from "@/lib/auth";
import { getQrAssociatedRecord, getQrCode, qrCodeImagePath, qrEntityLabels } from "@/lib/data/qr-codes";
import { notFound } from "next/navigation";

export default async function QrLabelPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser()).canManage) notFound();
  const { id } = await params;
  const code = await getQrCode(id);
  if (code.status !== "active") notFound();
  const record = await getQrAssociatedRecord(code);
  return <main className="min-h-svh bg-white p-6 text-[#07152d]"><div className="mx-auto max-w-sm"><div className="mb-5 flex items-center justify-between gap-3 print:hidden"><Link href={`/qr-codes/${id}`} className="text-sm text-cyan-700 hover:underline">← Back to QR code</Link><PrintLabelButton /></div><div className="rounded-xl border-2 border-slate-900 p-5 text-center"><p className="text-sm font-bold tracking-[0.13em]">NOGNOG ENTERPRISES</p><p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{qrEntityLabels[code.entity_type]}</p><Image src={qrCodeImagePath(code, "svg")} width={256} height={256} alt={`QR code ${code.public_identifier}`} unoptimized className="mx-auto mt-4" /><p className="mt-3 text-base font-semibold">{record.name}</p><p className="mt-1 text-xs text-slate-500">{record.code}</p><p className="mt-3 break-all font-mono text-xs">{code.public_identifier}</p></div></div></main>;
}
