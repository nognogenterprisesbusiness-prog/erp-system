import { IntentLink as Link } from "@/components/layout/intent-link";

type Stock = { id: string; name: string; onHand: number; available: number };
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });
export function InventoryStockLocations({ stocks, unit }: { stocks: Stock[]; unit: string }) {
  if (!stocks.length) return null;
  return <ul className="mt-2 space-y-1 text-sm text-slate-500">{stocks.map((stock) => <li key={stock.id}>
    <Link href={`/inventory?location=${stock.id}`} className="hover:text-cyan-700 hover:underline">{stock.name}</Link>
    <span className="tabular-nums"> · {quantity.format(stock.onHand)} {unit} on hand · {quantity.format(stock.available)} available</span>
  </li>)}</ul>;
}
