import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";

export default async function HelpPage() {
  const user = await requireUser();
  const guides = [
    { title: "Project records", href: "/projects", text: "Open a project to review its sites, material plan, progress and permitted reports. Record actual use under Materials; requests and deliveries are not usage." },
    { title: "Stock and deliveries", href: "/inventory", text: "Choose a warehouse or site to view its balances. Transfers reduce source stock when dispatched and increase destination stock when received. Never receive the same delivery twice." },
    ...((user.canManage || user.canOperateInventory || user.roles.some((role) => ["engineer", "foreman"].includes(role))) ? [{ title: "Material requests", href: "/requests", text: "Assigned site staff request materials. The assigned engineer reviews requests; Admin handles exceptions. Warehouse staff dispatch approved quantities, then site staff confirm receipt." }] : []),
    ...(user.canViewProcurement ? [{ title: "Purchases", href: "/purchase-orders", text: "Select the supplier, receiving warehouse and materials. Review the supplier prices, save the purchase, and record each delivery. Stock and weighted-average value update automatically when a receipt is posted." }] : []),
    { title: "Your account", href: "/profile", text: "Settings lets you update your profile. For missing project access or a rejected stock operation, ask your company administrator. QR codes identify records but never grant access." },
  ];
  return <><PageHeader title="Help" description="A short guide to the daily construction workflows." /><div className="mt-6 grid gap-4 md:grid-cols-2">{guides.map((guide) => <section key={guide.href} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold"><Link href={guide.href} className="hover:text-cyan-700">{guide.title}</Link></h2><p className="mt-3 text-sm leading-6 text-slate-600">{guide.text}</p></section>)}</div></>;
}
