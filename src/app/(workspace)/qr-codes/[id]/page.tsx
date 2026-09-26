import Image from "next/image";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChangeQrForm } from "@/components/qr/qr-action-form";
import { requireUser } from "@/lib/auth";
import { getQrAssociatedRecord, getQrCode, getQrEvents, getQrReplacement, qrCodeImagePath, qrEntityLabels } from "@/lib/data/qr-codes";

export default async function QrCodePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser()).canManage) notFound();
  const { id } = await params;
  const code = await getQrCode(id);
  const [events, record, replacement] = await Promise.all([getQrEvents(id), getQrAssociatedRecord(code), getQrReplacement(id)]);
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link href="/qr-codes" className="text-xs font-medium text-cyan-700 hover:underline">← QR registry</Link><h1 className="mt-2 text-3xl font-semibold tracking-tight">{record.name}</h1><p className="mt-1 text-sm text-slate-500">{qrEntityLabels[code.entity_type]} {record.code ? `· ${record.code}` : ""}</p></div><Badge variant={code.status === "active" ? "active" : "neutral"}>{code.status}</Badge></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="font-semibold">Label</h2><p className="mt-1 break-all font-mono text-xs text-slate-500">{code.public_identifier}</p>{code.status === "active" ? <><div className="mt-5 flex justify-center rounded-xl border border-slate-100 bg-white p-5"><Image src={qrCodeImagePath(code, "svg")} width={256} height={256} alt={`QR code ${code.public_identifier}`} unoptimized /></div><div className="mt-5 flex flex-wrap gap-2"><Button asChild size="sm"><Link href={`/qr-codes/${id}/label`} target="_blank">Print label</Link></Button><Button asChild variant="outline" size="sm"><a href={`${qrCodeImagePath(code, "png")}&download=1`}>Download PNG</a></Button><Button asChild variant="outline" size="sm"><a href={`${qrCodeImagePath(code, "svg")}&download=1`}>Download SVG</a></Button></div></> : <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">This label cannot be resolved or printed because it is {code.status}.</p>}</section>
      <div className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="font-semibold">Associated record</h2><p className="mt-3 text-sm">{record.name}</p><p className="mt-1 text-xs text-slate-500">{record.code ?? qrEntityLabels[code.entity_type]}</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href={record.href}>View record</Link></Button></section>{code.status === "active" && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="font-semibold">Manage label</h2><p className="mt-1 mb-5 text-xs text-slate-500">Replacing permanently invalidates the old printed label and issues a new identifier.</p><ChangeQrForm id={id} /></section>}</div>
    </div>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="font-semibold">History</h2>{code.replaces_qr_id && <p className="mt-2 text-xs text-slate-500">Replaces <Link className="text-cyan-700 hover:underline" href={`/qr-codes/${code.replaces_qr_id}`}>earlier label</Link></p>}{replacement && <p className="mt-2 text-xs text-slate-500">Replaced by <Link className="text-cyan-700 hover:underline" href={`/qr-codes/${replacement.id}`}>{replacement.public_identifier}</Link></p>}{events.length === 0 ? <EmptyState compact kind="items" title="No events recorded" /> : <ol className="mt-4 divide-y divide-slate-100">{events.map((event) => <li key={event.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between"><span className="capitalize">{event.event_type}{event.remarks ? ` · ${event.remarks}` : ""}</span><time className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</time></li>)}</ol>}</section>
  </>;
}
