import { IntentLink as Link } from "@/components/layout/intent-link";

const types = [
  { key: "materials", label: "Materials", href: "/inventory" },
  { key: "equipment", label: "Equipment", href: "/inventory?type=equipment" },
  { key: "vehicle", label: "Vehicles", href: "/inventory?type=vehicle" },
] as const;

export function InventoryTypeTabs({ active }: { active: (typeof types)[number]["key"] }) {
  return <nav aria-label="Inventory type" className="mb-5 flex flex-wrap gap-2">
    {types.map((item) => <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${active === item.key ? "border-[#07152d] bg-[#07152d] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
      {item.label}
    </Link>)}
  </nav>;
}
