import { IntentLink as Link } from "@/components/layout/intent-link";

const types = [
  { key: "materials", label: "Materials", href: "/inventory" },
  { key: "equipment", label: "Equipment", href: "/inventory?type=equipment" },
  { key: "vehicle", label: "Vehicles", href: "/inventory?type=vehicle" },
] as const;

export function InventoryTypeTabs({ active }: { active: (typeof types)[number]["key"] }) {
  return <nav aria-label="Inventory type" className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
    {types.map((item) => <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}
      className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${active === item.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
      {item.label}
    </Link>)}
  </nav>;
}
