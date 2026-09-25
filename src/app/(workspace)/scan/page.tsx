import { QrScanner } from "@/components/qr/qr-scanner";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export default async function ScanPage() {
  await requireUser();
  return <>
    <PageHeader eyebrow="QR workflow" title="Scan a QR label" description="Identify a material, location, or asset and choose an action you are allowed to perform." />
    <div className="mt-7 max-w-3xl"><QrScanner /></div>
  </>;
}
