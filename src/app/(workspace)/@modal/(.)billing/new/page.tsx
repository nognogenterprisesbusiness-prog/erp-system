import { InvoiceRouteModal } from "@/components/billing/invoice-route-modal";
import { NewInvoiceContent } from "@/components/billing/new-invoice-content";
import { requireFinanceViewer } from "@/lib/auth";

export default async function NewInvoiceModalPage() {
  await requireFinanceViewer();
  return <InvoiceRouteModal><NewInvoiceContent /></InvoiceRouteModal>;
}
