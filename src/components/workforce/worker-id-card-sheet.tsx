import Image from "next/image";

export type WorkerIdCardData = {
  rows: { id: string; code: string; first_name: string; last_name: string; categoryName: string; svg: string }[];
  projectName: string | null;
};

export function WorkerIdCardSheet({ data }: { data: WorkerIdCardData }) {
  return <div data-worker-id-print className={`mx-auto grid max-w-4xl grid-cols-1 justify-items-center gap-4 ${data.rows.length > 1 ? "sm:grid-cols-2" : ""} print:grid-cols-2 print:gap-[4mm]`}>
    <style>{`@media print {
      @page { size: A4; margin: 10mm; }
      body:has([data-worker-id-print]) *:not(:has([data-worker-id-print])):not([data-worker-id-print]):not([data-worker-id-print] *) { display: none !important; }
      body:has([data-worker-id-print]), body:has([data-worker-id-print]) *:has([data-worker-id-print]) { display: block !important; position: static !important; overflow: visible !important; height: auto !important; max-height: none !important; min-height: 0 !important; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: white !important; transform: none !important; }
      body:has([data-worker-id-print]) dialog::backdrop { display: none !important; }
    }`}</style>
    {data.rows.map((row) => <article key={row.id} className="flex h-[54mm] w-[85.6mm] max-w-full break-inside-avoid items-center gap-[4mm] overflow-hidden rounded-[3mm] border border-slate-400 p-[4mm] print:max-w-none">
      <Image unoptimized src={`data:image/svg+xml,${encodeURIComponent(row.svg)}`} width={144} height={144} className="size-[38mm] shrink-0" alt={`QR code for ${row.first_name} ${row.last_name}`} />
      <div className="min-w-0"><p className="text-[9pt] font-bold tracking-[0.14em]">NOGNOG</p><p className="text-[7pt] uppercase tracking-wide text-slate-500">Worker ID</p><p className="mt-[3mm] text-[11pt] font-semibold leading-tight break-words">{row.first_name} {row.last_name}</p><p className="mt-[1mm] text-[8pt] text-slate-600">{row.code}</p><p className="text-[8pt] text-slate-600 break-words">{row.categoryName}</p></div>
    </article>)}
  </div>;
}
