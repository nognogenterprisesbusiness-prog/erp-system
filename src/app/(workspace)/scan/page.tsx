import { QrScanner } from "@/components/qr/qr-scanner";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export default async function ScanPage() {
  await requireUser();
  return <>
    <PageHeader eyebrow="QR workflow" title="Scan a QR label" description="Scan a label to open a material, location or piece of equipment." />
    <div className="mt-7 max-w-3xl"><QrScanner /></div>
  </>;
}
