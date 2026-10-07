import { IntentLink as Link } from "@/components/layout/intent-link";

export type RequestType = "material" | "equipment" | "vehicle";

const types: { value: RequestType; label: string }[] = [
  { value: "material", label: "Materials" },
  { value: "equipment", label: "Equipment" },
  { value: "vehicle", label: "Vehicles" },
];

export function RequestTypeNav({ active, showAssets = true }: { active: RequestType; showAssets?: boolean }) {
  return <nav aria-label="Request type" className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
    {types.filter(({ value }) => value === "material" || showAssets).map(({ value, label }) => <Link key={value} href={value === "material" ? "/requests" : `/requests?type=${value}`} aria-current={active === value ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${active === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>{label}</Link>)}
  </nav>;
}
