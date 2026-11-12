import { IntentLink as Link } from "@/components/layout/intent-link";

type Stock = { id: string; name: string; onHand: number; available: number };
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });
export function InventoryStockLocations({ stocks, unit }: { stocks: Stock[]; unit: string }) {
  if (!stocks.length) return null;
  return <ul aria-label="Stock by location" className="mt-3 divide-y divide-slate-100">{stocks.map(stock => <li key={stock.id} className="py-3 first:pt-0 last:pb-0">
    <Link href={`/inventory?location=${stock.id}`} className="inline-block break-words rounded text-sm font-medium leading-6 text-slate-800 hover:text-cyan-700 focus-visible:outline-2 focus-visible:outline-cyan-600">{stock.name}</Link>
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2"><div><dt className="text-sm leading-5 text-slate-600">Total stock</dt><dd className="mt-0.5 text-sm font-medium text-slate-700 tabular-nums">{quantity.format(stock.onHand)} {unit}</dd></div><div><dt className="text-sm leading-5 text-slate-600">Available</dt><dd className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">{quantity.format(stock.available)} {unit}</dd></div></dl>
  </li>)}</ul>;
}
