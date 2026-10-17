"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ArrowDown01Icon, CheckmarkCircle02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { fieldControlClass } from "@/components/ui/form-field";
import { inventoryScopeLabel, type InventoryScope } from "@/lib/inventory/scope";

type Location = { id: string; name: string; location_type: string; detail?: string };
const collator = new Intl.Collator("en-PH", { numeric: true, sensitivity: "base" });

export function InventoryLocationPicker({ locations, value, scope }: { locations: Location[]; value: string; scope?: InventoryScope }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const summaryScopes: InventoryScope[] = scope ? [
    ...(locations.some((location) => location.location_type === "warehouse") ? ["warehouses" as const] : []),
    ...(locations.some((location) => location.location_type === "project_site") ? ["sites" as const] : []),
    "overview",
  ] : ["overview"];
  if (scope && !summaryScopes.includes(scope)) summaryScopes.unshift(scope);
  const selected = value || scope || "overview";
  const selectedLocation = locations.find((location) => location.id === selected);
  const label = selectedLocation?.name ?? (summaryScopes.includes(selected as InventoryScope) ? inventoryScopeLabel(selected as InventoryScope) : "Choose stock location");
  const needle = query.trim().toLocaleLowerCase("en-PH");
  const matches = locations.filter((location) => `${location.name} ${location.detail ?? ""}`.toLocaleLowerCase("en-PH").includes(needle))
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  const groups = [
    { kind: "warehouse", title: "Warehouses", singular: "Warehouse" },
    { kind: "project_site", title: "Project sites", singular: "Site" },
  ];

  function choose(locationId: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (summaryScopes.includes(locationId as InventoryScope)) {
      next.delete("location");
      if (scope) next.set("scope", locationId);
      else next.delete("scope");
    } else next.set("location", locationId);
    next.delete("page");
    dialog.current?.close();
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return <div className="w-full min-w-0 sm:w-[340px]">
    <button type="button" aria-label={`Stock location: ${label}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setQuery(""); dialog.current?.showModal(); setOpen(true); search.current?.focus(); }}
      className="flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 outline-none transition hover:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/20">
      <HugeiconsIcon icon={Location01Icon} size={18} className="shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
      {selectedLocation && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{selectedLocation.location_type === "warehouse" ? "Warehouse" : "Site"}</span>}
      <HugeiconsIcon icon={ArrowDown01Icon} size={16} className="shrink-0" />
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onClose={() => setOpen(false)}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <DialogHeading id={titleId} title="Choose stock location" onClose={() => dialog.current?.close()} />
        <p id={descriptionId} className="mt-2 text-sm text-slate-500">Choose combined totals or a specific warehouse or project site.</p>
        <input ref={search} type="search" aria-label="Search stock locations" placeholder="Search warehouse, site, project or address…" maxLength={100}
          value={query} onChange={(event) => setQuery(event.target.value)} className={`${fieldControlClass} mt-4`} />
      </div>
      <div className="dialog-scroll max-h-[calc(90dvh-12rem)] space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
        <section aria-label="Combined stock totals">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Combined totals</h3>
          <div className="grid gap-2 sm:grid-cols-3">{summaryScopes.map((item) => <button key={item} type="button" aria-pressed={selected === item} onClick={() => choose(item)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${selected === item ? "border-cyan-600 bg-cyan-50 text-cyan-800" : "border-slate-200 hover:bg-slate-50"}`}>
            {inventoryScopeLabel(item)}
          </button>)}</div>
        </section>
        <p role="status" className="text-sm text-slate-500">{matches.length} matching location{matches.length === 1 ? "" : "s"}</p>
        {groups.map((group) => {
          const rows = matches.filter((location) => location.location_type === group.kind);
          if (!rows.length) return null;
          return <section key={group.kind} aria-label={group.title}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">{group.title}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rows.length}</span></h3>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">{rows.map((location) => <button key={location.id} type="button" aria-pressed={selected === location.id} onClick={() => choose(location.id)}
              className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 ${selected === location.id ? "bg-cyan-50 text-cyan-900" : "hover:bg-slate-50"}`}>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{location.name}</span>{location.detail && <span className="mt-1 block break-words text-sm text-slate-500">{location.detail}</span>}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{group.singular}</span>
              {selected === location.id && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} className="shrink-0 text-cyan-700" />}
            </button>)}</div>
          </section>;
        })}
        {!matches.length && <p className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No matching locations. Try another name, project or address.</p>}
      </div>
    </dialog>
  </div>;
}
