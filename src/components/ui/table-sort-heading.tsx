export const tableHeadClass = "bg-slate-50 text-xs font-semibold tracking-[0.06em] text-slate-600";

export function TableSortHeading({ label, active, direction, onSort, className = "" }: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onSort: () => void;
  className?: string;
}) {
  return <th scope="col" aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"} className={`px-5 py-3 ${className}`}>
    <button type="button" onClick={onSort} className="inline-flex items-center gap-1 rounded text-left font-semibold hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
      {label}<span aria-hidden="true" className="text-xs">{active ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
    </button>
  </th>;
}
